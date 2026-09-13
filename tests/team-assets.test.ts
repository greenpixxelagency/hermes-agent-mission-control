import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  ASSET_LIMITS,
  ManagedAssetError,
  assetStorage,
  validateManagedAsset,
} from "../src/lib/managed-assets.ts";
import { voiceCapabilityForAssignment } from "../src/lib/voice-note-contract.ts";

test("text attachment is normalized and unsafe filename characters are removed", async () => {
  const result = await validateManagedAsset(
    "DOCUMENT",
    Buffer.from("project notes\n"),
    "../quarter:\u0000notes.md",
  );
  assert.equal(result.mimeType, "text/markdown");
  assert.equal(result.safeName, "quarter-notes.md");
  assert.equal(result.sha256.length, 64);
});

test("invalid UTF-8 and oversized assets fail closed", async () => {
  await assert.rejects(
    validateManagedAsset("DOCUMENT", Buffer.from([0xc3, 0x28]), "bad.txt"),
    (error: unknown) =>
      error instanceof ManagedAssetError && error.code === "MALFORMED_TEXT",
  );
  await assert.rejects(
    validateManagedAsset(
      "AVATAR",
      Buffer.alloc(ASSET_LIMITS.AVATAR + 1),
      "large.png",
    ),
    (error: unknown) =>
      error instanceof ManagedAssetError && error.code === "ASSET_SIZE_LIMIT",
  );
});

test("avatar images are decoded, bounded, and re-encoded as metadata-free WebP", async () => {
  const source = await sharp({
    create: { width: 8, height: 6, channels: 4, background: "#34d399" },
  })
    .png()
    .withMetadata({ exif: { IFD0: { Copyright: "private metadata" } } })
    .toBuffer();
  const result = await validateManagedAsset("AVATAR", source, "portrait.png");
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.safeName, "portrait.webp");
  assert.equal(result.width, 8);
  assert.equal(result.height, 6);
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
});

test("malformed PDF, fake DOCX, and executable content are rejected", async () => {
  for (const [bytes, name] of [
    [Buffer.from("%PDF-1.7\nmissing eof"), "broken.pdf"],
    [Buffer.from("PK\u0003\u0004not an office package"), "broken.docx"],
    [Buffer.from("MZ executable"), "payload.txt"],
  ] as const) {
    await assert.rejects(
      validateManagedAsset("DOCUMENT", bytes, name),
      ManagedAssetError,
    );
  }
});

test("local storage uses contained keys and round-trips private bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rogeros-assets-"));
  const priorProvider = process.env.ROGEROS_ASSET_STORAGE_PROVIDER;
  const priorRoot = process.env.ROGEROS_ASSET_LOCAL_ROOT;
  process.env.ROGEROS_ASSET_STORAGE_PROVIDER = "local";
  process.env.ROGEROS_ASSET_LOCAL_ROOT = root;
  try {
    const storage = assetStorage();
    await storage.put("assets/test.txt", Buffer.from("private"), "text/plain");
    assert.equal((await storage.read("assets/test.txt")).toString(), "private");
    assert.equal(
      (await readFile(path.join(root, "assets", "test.txt"))).toString(),
      "private",
    );
    await assert.rejects(
      storage.read("../escape.txt"),
      (error: unknown) =>
        error instanceof ManagedAssetError &&
        error.code === "INVALID_STORAGE_KEY",
    );
    await storage.delete("assets/test.txt");
  } finally {
    if (priorProvider === undefined)
      delete process.env.ROGEROS_ASSET_STORAGE_PROVIDER;
    else process.env.ROGEROS_ASSET_STORAGE_PROVIDER = priorProvider;
    if (priorRoot === undefined) delete process.env.ROGEROS_ASSET_LOCAL_ROOT;
    else process.env.ROGEROS_ASSET_LOCAL_ROOT = priorRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test("voice capability remains default-deny without server credentials", async () => {
  const priorBase = process.env.HERMES_T2A_BASE_URL;
  const priorToken = process.env.HERMES_T2A_AUTH_TOKEN;
  delete process.env.HERMES_T2A_BASE_URL;
  delete process.env.HERMES_T2A_AUTH_TOKEN;
  try {
    assert.deepEqual(await voiceCapabilityForAssignment("assignment-a"), {
      available: false,
    });
  } finally {
    if (priorBase !== undefined) process.env.HERMES_T2A_BASE_URL = priorBase;
    if (priorToken !== undefined)
      process.env.HERMES_T2A_AUTH_TOKEN = priorToken;
  }
});

test("voice capability accepts only the documented bounded shape", async () => {
  const priorBase = process.env.HERMES_T2A_BASE_URL;
  const priorToken = process.env.HERMES_T2A_AUTH_TOKEN;
  const priorFetch = globalThis.fetch;
  process.env.HERMES_T2A_BASE_URL = "http://127.0.0.1:9098";
  process.env.HERMES_T2A_AUTH_TOKEN = "test-token";
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        String(input),
        "http://127.0.0.1:9098/bindings/assignment-a/capabilities",
      );
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer test-token",
      );
      return Response.json({
        runtimeAssignmentId: "assignment-a",
        voiceNoteTranscription: {
          available: true,
          contractVersion: "rogeros-attachment-v1",
          acceptedMimeTypes: ["audio/webm", "application/octet-stream"],
          maxBytes: 3_900_000,
          maxDurationSeconds: 120,
        },
      });
    };
    assert.deepEqual(await voiceCapabilityForAssignment("assignment-a"), {
      available: true,
      acceptedMimeTypes: ["audio/webm"],
      maxBytes: 3_900_000,
      maxDurationMs: 120_000,
    });

    globalThis.fetch = async () =>
      Response.json({
        runtimeAssignmentId: "assignment-a",
        voiceNoteTranscription: {
          available: true,
          contractVersion: "rogeros-attachment-v1",
          acceptedMimeTypes: ["audio/webm"],
          maxBytes: 3_900_000,
          maxDurationMs: 120_000,
        },
      });
    assert.deepEqual(await voiceCapabilityForAssignment("assignment-a"), {
      available: false,
    });
  } finally {
    globalThis.fetch = priorFetch;
    if (priorBase === undefined) delete process.env.HERMES_T2A_BASE_URL;
    else process.env.HERMES_T2A_BASE_URL = priorBase;
    if (priorToken === undefined) delete process.env.HERMES_T2A_AUTH_TOKEN;
    else process.env.HERMES_T2A_AUTH_TOKEN = priorToken;
  }
});
