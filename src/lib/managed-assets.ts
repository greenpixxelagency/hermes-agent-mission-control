import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { parseBuffer } from "music-metadata";
import sharp from "sharp";
import yauzl from "yauzl";
import { del, get, put } from "@vercel/blob";
import { AuditActorType, ManagedAssetKind, ProjectRole } from "@prisma/client";
import type { ProjectContext } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";

export const ASSET_LIMITS = {
  AVATAR: 5 * 1024 * 1024,
  DOCUMENT: 20 * 1024 * 1024,
  VOICE_NOTE: 12 * 1024 * 1024,
  MESSAGE_COUNT: 5,
  MESSAGE_BYTES: 25 * 1024 * 1024,
  PROJECT_BYTES: 250 * 1024 * 1024,
  VOICE_DURATION_MS: 120_000,
} as const;

// Vercel Functions reject request/response payloads above 4.5 MB. Keep the
// multipart body below that hard ceiling until a reviewed direct-upload flow
// replaces the server upload transport.
export const BROWSER_UPLOAD_FILE_BYTES = 3_900_000;
export const BROWSER_UPLOAD_BODY_BYTES = 4_000_000;

const operators = new Set<ProjectRole>(["OWNER", "ADMIN", "OPERATOR"]);
const managers = new Set<ProjectRole>(["OWNER", "ADMIN"]);
const extensionForMime: Record<string, string> = {
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
};

export class ManagedAssetError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export type ValidatedAsset = {
  bytes: Buffer;
  safeName: string;
  mimeType: string;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

function safeName(value: string, fallback: string) {
  const base = path
    .basename(value || fallback)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (base || fallback).slice(0, 120);
}

function strictUtf8(bytes: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ManagedAssetError("MALFORMED_TEXT", 415);
  }
}

async function validateDocx(bytes: Buffer) {
  if (bytes.length < 64) throw new ManagedAssetError("MALFORMED_DOCX", 415);
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new ManagedAssetError("MALFORMED_DOCX", 415));
        let count = 0;
        let expandedBytes = 0;
        const names = new Set<string>();
        const fail = () => {
          zip.close();
          reject(new ManagedAssetError("MALFORMED_DOCX", 415));
        };
        zip.on("entry", (entry) => {
          count += 1;
          expandedBytes += entry.uncompressedSize;
          const name = entry.fileName.replaceAll("\\", "/");
          if (
            count > 200 ||
            expandedBytes > 50 * 1024 * 1024 ||
            entry.uncompressedSize >
              Math.max(entry.compressedSize * 100, 1024) ||
            name.startsWith("/") ||
            name.split("/").includes("..") ||
            /(?:vbaProject\.bin|word\/embeddings\/)/i.test(name)
          )
            return fail();
          names.add(name);
          zip.readEntry();
        });
        zip.on("error", fail);
        zip.on("end", () => {
          if (
            !names.has("[Content_Types].xml") ||
            !names.has("word/document.xml")
          )
            return fail();
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}

export async function validateManagedAsset(
  kind: ManagedAssetKind,
  input: Buffer,
  originalName: string,
): Promise<ValidatedAsset> {
  const limit =
    kind === "AVATAR"
      ? ASSET_LIMITS.AVATAR
      : kind === "VOICE_NOTE"
        ? ASSET_LIMITS.VOICE_NOTE
        : ASSET_LIMITS.DOCUMENT;
  if (!input.length || input.length > limit)
    throw new ManagedAssetError("ASSET_SIZE_LIMIT", 413);
  const detected = await fileTypeFromBuffer(input);
  let bytes = input,
    mimeType = detected?.mime || "",
    width: number | null = null,
    height: number | null = null,
    durationMs: number | null = null;

  if (kind === "AVATAR" || kind === "IMAGE") {
    if (
      !detected ||
      !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)
    )
      throw new ManagedAssetError("UNSUPPORTED_IMAGE", 415);
    const source = sharp(input, {
      animated: false,
      failOn: "warning",
      limitInputPixels: 4096 * 4096,
    });
    const metadata = await source.metadata().catch(() => {
      throw new ManagedAssetError("MALFORMED_IMAGE", 415);
    });
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      metadata.height > 4096
    )
      throw new ManagedAssetError("IMAGE_DIMENSION_LIMIT", 413);
    bytes = await source.rotate().webp({ quality: 86 }).toBuffer();
    mimeType = "image/webp";
    width = metadata.width;
    height = metadata.height;
  } else if (kind === "VOICE_NOTE") {
    if (
      !detected ||
      !["audio/webm", "video/webm", "audio/ogg", "audio/mp4"].includes(
        detected.mime,
      )
    )
      throw new ManagedAssetError("UNSUPPORTED_AUDIO", 415);
    const metadata = await parseBuffer(
      input,
      { mimeType: detected.mime, size: input.length },
      { duration: true, skipCovers: true },
    ).catch(() => {
      throw new ManagedAssetError("MALFORMED_AUDIO", 415);
    });
    durationMs = Math.ceil((metadata.format.duration || 0) * 1000);
    if (
      !durationMs ||
      durationMs > ASSET_LIMITS.VOICE_DURATION_MS ||
      !metadata.format.numberOfChannels
    )
      throw new ManagedAssetError("AUDIO_DURATION_LIMIT", 413);
    mimeType = detected.mime === "video/webm" ? "audio/webm" : detected.mime;
  } else {
    const lower = originalName.toLocaleLowerCase();
    if (detected?.mime === "application/pdf") {
      const end = input.lastIndexOf(Buffer.from("%%EOF"));
      if (
        end < 0 ||
        input
          .subarray(end + 5)
          .toString("utf8")
          .trim()
      )
        throw new ManagedAssetError("MALFORMED_PDF", 415);
      mimeType = detected.mime;
    } else if (
      detected?.mime === "application/zip" &&
      lower.endsWith(".docx")
    ) {
      await validateDocx(input);
      mimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (!detected && (lower.endsWith(".txt") || lower.endsWith(".md"))) {
      const text = strictUtf8(input);
      if (text.includes("\0"))
        throw new ManagedAssetError("MALFORMED_TEXT", 415);
      mimeType = lower.endsWith(".md") ? "text/markdown" : "text/plain";
    } else if (
      detected &&
      ["image/jpeg", "image/png", "image/webp"].includes(detected.mime)
    ) {
      const normalized = await validateManagedAsset(
        "IMAGE",
        input,
        originalName,
      );
      return normalized;
    } else throw new ManagedAssetError("UNSUPPORTED_DOCUMENT", 415);
  }
  const ext = extensionForMime[mimeType] || "";
  const stem = safeName(originalName, `attachment${ext}`).replace(
    /\.[^.]+$/,
    "",
  );
  return {
    bytes,
    safeName: `${stem}${ext}`.slice(0, 120),
    mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width,
    height,
    durationMs,
  };
}

type AssetStorage = {
  provider: string;
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};

function localPath(key: string) {
  const root = path.resolve(
    process.env.ROGEROS_ASSET_LOCAL_ROOT ||
      path.join(process.cwd(), ".rogeros-assets"),
  );
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`))
    throw new ManagedAssetError("INVALID_STORAGE_KEY", 500);
  return { root, target };
}

export function assetStorage(providerOverride?: string): AssetStorage {
  const provider =
    providerOverride ||
    process.env.ROGEROS_ASSET_STORAGE_PROVIDER ||
    (process.env.NODE_ENV === "production" ? "" : "local");
  if (provider === "local")
    return {
      provider,
      async put(key, bytes) {
        const p = localPath(key);
        await mkdir(path.dirname(p.target), { recursive: true });
        await writeFile(p.target, bytes, { flag: "wx" });
      },
      async read(key) {
        return readFile(localPath(key).target);
      },
      async delete(key) {
        await unlink(localPath(key).target).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          },
        );
      },
    };
  if (provider === "vercel-blob" && process.env.BLOB_READ_WRITE_TOKEN)
    return {
      provider,
      async put(key, bytes, mime) {
        await put(key, bytes, {
          access: "private",
          addRandomSuffix: false,
          contentType: mime,
          cacheControlMaxAge: 60,
        });
      },
      async read(key) {
        const result = await get(key, { access: "private", useCache: false });
        if (!result || result.statusCode !== 200)
          throw new ManagedAssetError("ASSET_NOT_FOUND", 404);
        return Buffer.from(await new Response(result.stream).arrayBuffer());
      },
      async delete(key) {
        await del(key);
      },
    };
  throw new ManagedAssetError("ASSET_STORAGE_NOT_CONFIGURED", 503);
}

async function actorId(context: ProjectContext) {
  const actor = await prisma.projectMember.findFirst({
    where: {
      projectId: context.project.id,
      organizationMember: { userId: context.user.id },
    },
    select: { id: true },
  });
  if (!actor) throw new ManagedAssetError("NOT_FOUND", 404);
  return actor.id;
}

export async function createManagedAsset(
  context: ProjectContext,
  kind: ManagedAssetKind,
  file: File,
) {
  if (!(kind === "AVATAR" ? managers : operators).has(context.project.role))
    throw new ManagedAssetError("FORBIDDEN", 403);
  const limit =
    kind === "AVATAR"
      ? ASSET_LIMITS.AVATAR
      : kind === "VOICE_NOTE"
        ? ASSET_LIMITS.VOICE_NOTE
        : ASSET_LIMITS.DOCUMENT;
  if (!file.size || file.size > limit)
    throw new ManagedAssetError("ASSET_SIZE_LIMIT", 413);
  const validated = await validateManagedAsset(
    kind,
    Buffer.from(await file.arrayBuffer()),
    file.name,
  );
  const used = await prisma.managedAsset.aggregate({
    where: {
      projectId: context.project.id,
      state: { in: ["PENDING", "ACTIVE", "DELETION_PENDING"] },
    },
    _sum: { byteLength: true },
  });
  if (
    (used._sum.byteLength || 0) + validated.bytes.length >
    ASSET_LIMITS.PROJECT_BYTES
  )
    throw new ManagedAssetError("PROJECT_ASSET_QUOTA", 413);
  const storage = assetStorage();
  const key = `assets/${randomUUID().replaceAll("-", "")}${extensionForMime[validated.mimeType] || ""}`;
  const actor = await actorId(context);
  const asset = await prisma.managedAsset.create({
    data: {
      projectId: context.project.id,
      kind,
      storageProvider: storage.provider,
      storageKey: key,
      safeName: validated.safeName,
      mimeType: validated.mimeType,
      byteLength: validated.bytes.length,
      sha256: validated.sha256,
      width: validated.width,
      height: validated.height,
      durationMs: validated.durationMs,
      createdById: context.user.id,
      retentionUntil:
        kind === "AVATAR" ? null : new Date(Date.now() + 180 * 86400_000),
    },
  });
  try {
    await storage.put(key, validated.bytes, validated.mimeType);
    const active = await prisma.managedAsset.update({
      where: { id: asset.id },
      data: { state: "ACTIVE" },
    });
    await recordAuditEvent({
      projectId: context.project.id,
      eventType: "team.asset.created",
      actor: { type: AuditActorType.HUMAN, projectMemberId: actor },
      targetType: "ManagedAsset",
      targetId: asset.id,
      summary: "Managed asset created",
      metadata: {
        kind,
        mimeType: validated.mimeType,
        byteLength: validated.bytes.length,
      },
    });
    return active;
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    await prisma.managedAsset
      .update({ where: { id: asset.id }, data: { state: "FAILED" } })
      .catch(() => undefined);
    throw error;
  }
}

export async function readManagedAsset(
  context: ProjectContext,
  assetId: string,
) {
  const asset = await prisma.managedAsset.findFirst({
    where: {
      id: assetId,
      projectId: context.project.id,
      state: "ACTIVE",
      OR: [
        {
          messageLinks: {
            some: {
              message: {
                conversation: {
                  participants: { some: { userId: context.user.id } },
                },
              },
            },
          },
        },
        { avatarFor: { some: {} } },
      ],
    },
  });
  if (!asset) throw new ManagedAssetError("ASSET_NOT_FOUND", 404);
  return {
    asset,
    bytes: await assetStorage(asset.storageProvider).read(asset.storageKey),
  };
}

export async function retireManagedAsset(assetId: string) {
  const asset = await prisma.managedAsset.findUnique({
    where: { id: assetId },
  });
  if (!asset || asset.state === "DELETED") return;
  await prisma.managedAsset.update({
    where: { id: asset.id },
    data: { state: "DELETION_PENDING" },
  });
  await assetStorage(asset.storageProvider).delete(asset.storageKey);
  await prisma.managedAsset.update({
    where: { id: asset.id },
    data: { state: "DELETED", deletedAt: new Date() },
  });
}

export async function cleanupManagedAssets(now = new Date()) {
  const candidates = await prisma.managedAsset.findMany({
    where: {
      OR: [
        { state: "DELETION_PENDING" },
        { state: { in: ["ACTIVE", "FAILED"] }, retentionUntil: { lte: now } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  let deleted = 0;
  let failed = 0;
  for (const asset of candidates) {
    try {
      if (asset.state !== "DELETION_PENDING")
        await prisma.managedAsset.update({
          where: { id: asset.id },
          data: { state: "DELETION_PENDING" },
        });
      await assetStorage(asset.storageProvider).delete(asset.storageKey);
      await prisma.managedAsset.update({
        where: { id: asset.id },
        data: { state: "DELETED", deletedAt: now },
      });
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { examined: candidates.length, deleted, failed };
}

export async function setUploadedAvatar(
  context: ProjectContext,
  assignmentId: string,
  assetId: string | null,
) {
  if (!managers.has(context.project.role))
    throw new ManagedAssetError("FORBIDDEN", 403);
  const [assignment, actor] = await Promise.all([
    prisma.employeeProjectAssignment.findFirst({
      where: { id: assignmentId, projectId: context.project.id },
      select: { id: true, avatarAssetId: true },
    }),
    actorId(context),
  ]);
  if (!assignment) throw new ManagedAssetError("NOT_FOUND", 404);
  if (
    assetId &&
    !(await prisma.managedAsset.findFirst({
      where: {
        id: assetId,
        projectId: context.project.id,
        kind: "AVATAR",
        state: "ACTIVE",
      },
      select: { id: true },
    }))
  )
    throw new ManagedAssetError("ASSET_NOT_FOUND", 404);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.employeeProjectAssignment.update({
      where: { id: assignment.id },
      data: { avatarAssetId: assetId },
      select: { id: true, avatarAssetId: true, avatarPresetKey: true },
    });
    await recordAuditEvent(
      {
        projectId: context.project.id,
        eventType: assetId
          ? "team.avatar.uploaded"
          : "team.avatar.upload.removed",
        actor: { type: AuditActorType.HUMAN, projectMemberId: actor },
        targetType: "EmployeeProjectAssignment",
        targetId: assignment.id,
        summary: assetId
          ? "Uploaded employee avatar selected"
          : "Uploaded employee avatar removed",
        metadata: { assetId },
      },
      tx,
    );
    return row;
  });
  return { ...updated, previousAvatarAssetId: assignment.avatarAssetId };
}
