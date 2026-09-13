import { createHash, createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { assetStorage, ManagedAssetError } from "@/lib/managed-assets";

export type VoiceContractBody = {
  contractVersion: "rogeros-attachment-v1";
  purpose: "VOICE_NOTE_TRANSCRIPTION";
  projectId: string;
  runtimeId: string;
  runtimeAssignmentId: string;
  profileId: string;
  conversationId: string;
  messageId: string;
  assetId: string;
  correlationId: string;
  authorizedActorId: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  redemptionToken: string;
  send: false;
};

function stableBody(body: VoiceContractBody) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(body).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}

function adapterBaseUrl() {
  const base = process.env.HERMES_T2A_BASE_URL || "";
  const url = new URL(base);
  if (
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new ManagedAssetError("VOICE_TRANSCRIPTION_UNAVAILABLE", 503);
  return url;
}

export async function voiceCapabilityForAssignment(
  runtimeAssignmentId: string,
) {
  const auth = process.env.HERMES_T2A_AUTH_TOKEN || "";
  if (!auth || !process.env.HERMES_T2A_BASE_URL)
    return { available: false as const };
  try {
    const response = await fetch(
      new URL(
        `/bindings/${encodeURIComponent(runtimeAssignmentId)}/capabilities`,
        adapterBaseUrl(),
      ),
      {
        redirect: "error",
        headers: { Authorization: `Bearer ${auth}` },
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      },
    );
    const result = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const voice = result.voiceNoteTranscription as
      Record<string, unknown> | undefined;
    if (
      !response.ok ||
      result.runtimeAssignmentId !== runtimeAssignmentId ||
      voice?.available !== true ||
      voice.contractVersion !== "rogeros-attachment-v1" ||
      voice.purpose !== "VOICE_NOTE_TRANSCRIPTION"
    )
      return { available: false as const };
    const acceptedMimeTypes = Array.isArray(voice.acceptedMimeTypes)
      ? voice.acceptedMimeTypes.filter((value): value is string =>
          ["audio/webm", "audio/ogg", "audio/mp4"].includes(String(value)),
        )
      : [];
    const maxBytes = Number(voice.maxBytes);
    const maxDurationMs = Number(voice.maxDurationMs);
    if (
      !acceptedMimeTypes.length ||
      !Number.isInteger(maxBytes) ||
      maxBytes <= 0 ||
      maxBytes > 12_582_912 ||
      !Number.isInteger(maxDurationMs) ||
      maxDurationMs <= 0 ||
      maxDurationMs > 120_000
    )
      return { available: false as const };
    return {
      available: true as const,
      acceptedMimeTypes,
      maxBytes,
      maxDurationMs,
    };
  } catch {
    return { available: false as const };
  }
}

export async function createVoiceRedemption(
  input: Omit<
    VoiceContractBody,
    | "contractVersion"
    | "purpose"
    | "issuedAt"
    | "expiresAt"
    | "nonce"
    | "redemptionToken"
    | "send"
  >,
) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const configuredTtl = Number(
    process.env.HERMES_T2A_REDEMPTION_TOKEN_TTL_MS || 45_000,
  );
  const ttl = Number.isFinite(configuredTtl)
    ? Math.min(Math.max(configuredTtl, 5_000), 60_000)
    : 45_000;
  const body: VoiceContractBody = {
    ...input,
    contractVersion: "rogeros-attachment-v1",
    purpose: "VOICE_NOTE_TRANSCRIPTION",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    nonce: randomBytes(18).toString("base64url"),
    redemptionToken: token,
    send: false,
  };
  await prisma.assetRedemption.create({
    data: {
      projectId: body.projectId,
      assetId: body.assetId,
      runtimeId: body.runtimeId,
      runtimeAssignmentId: body.runtimeAssignmentId,
      profileId: body.profileId,
      conversationId: body.conversationId,
      messageId: body.messageId,
      correlationId: body.correlationId,
      authorizedActorId: body.authorizedActorId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(body.expiresAt),
    },
  });
  return body;
}

export async function redeemVoiceAsset(
  assetId: string,
  bearer: string,
  acceptedMimeType: string,
) {
  if (!bearer || bearer.length > 200)
    throw new ManagedAssetError("INVALID_REDEMPTION", 401);
  const tokenHash = createHash("sha256").update(bearer).digest("hex");
  const now = new Date();
  const redemption = await prisma.assetRedemption.findFirst({
    where: { assetId, tokenHash, redeemedAt: null, expiresAt: { gt: now } },
    include: { asset: true },
  });
  if (
    !redemption ||
    redemption.asset.state !== "ACTIVE" ||
    redemption.asset.kind !== "VOICE_NOTE" ||
    acceptedMimeType !== redemption.asset.mimeType
  )
    throw new ManagedAssetError("INVALID_REDEMPTION", 401);
  const claimed = await prisma.assetRedemption.updateMany({
    where: { id: redemption.id, redeemedAt: null, expiresAt: { gt: now } },
    data: { redeemedAt: now },
  });
  if (claimed.count !== 1)
    throw new ManagedAssetError("REDEMPTION_REPLAY", 409);
  const bytes = await assetStorage(redemption.asset.storageProvider).read(
    redemption.asset.storageKey,
  );
  if (
    bytes.length !== redemption.asset.byteLength ||
    createHash("sha256").update(bytes).digest("hex") !== redemption.asset.sha256
  )
    throw new ManagedAssetError("ASSET_INTEGRITY", 422);
  return { asset: redemption.asset, bytes };
}

export async function transcribeVoiceNote(body: VoiceContractBody) {
  const auth = process.env.HERMES_T2A_AUTH_TOKEN || "";
  const secret = process.env.HERMES_T2A_HMAC_SECRET || "";
  if (!process.env.HERMES_T2A_BASE_URL || !auth || !secret)
    throw new ManagedAssetError("VOICE_TRANSCRIPTION_UNAVAILABLE", 503);
  const url = adapterBaseUrl();
  const raw = stableBody(body);
  const digest = createHash("sha256").update(raw).digest("hex");
  const signature = createHmac("sha256", secret)
    .update(
      `rogeros-attachment-v1\nPOST\n/v1/voice-notes/transcribe\n${digest}`,
    )
    .digest("hex");
  const response = await fetch(new URL("/v1/voice-notes/transcribe", url), {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
      "x-rogeros-signature": signature,
    },
    body: raw,
    signal: AbortSignal.timeout(150_000),
  });
  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const safeCode =
      typeof result.error === "string" &&
      /^[A-Z][A-Z0-9_]{0,63}$/.test(result.error)
        ? result.error
        : "VOICE_TRANSCRIPTION_FAILED";
    throw new ManagedAssetError(safeCode, response.status);
  }
  if (
    result.contractVersion !== body.contractVersion ||
    result.runtimeAssignmentId !== body.runtimeAssignmentId ||
    result.profileId !== body.profileId ||
    result.assetId !== body.assetId ||
    result.correlationId !== body.correlationId ||
    typeof result.receiptId !== "string" ||
    result.status !== "TRANSCRIBED" ||
    typeof result.transcript !== "string" ||
    !result.transcript.trim() ||
    typeof result.completedAt !== "string" ||
    !Number.isFinite(Date.parse(result.completedAt))
  )
    throw new ManagedAssetError("VOICE_TRANSCRIPTION_SHAPE", 502);
  return {
    receiptId: result.receiptId,
    transcript: result.transcript.trim().slice(0, 4_000),
  };
}
