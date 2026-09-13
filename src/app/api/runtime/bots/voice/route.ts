import { NextResponse } from "next/server";

import { botErrorResponse } from "@/lib/hermes-bot-api";
import {
  failHermesVoiceRequest,
  prepareHermesVoiceRequest,
  sendHermesBotMessage,
} from "@/lib/hermes-bots";
import { hermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import {
  BROWSER_UPLOAD_BODY_BYTES,
  BROWSER_UPLOAD_FILE_BYTES,
  createManagedAsset,
  ManagedAssetError,
  retireManagedAsset,
} from "@/lib/managed-assets";
import { requireProjectContext } from "@/lib/project-context";
import { projectScopeErrorResponse } from "@/lib/project-scope";
import {
  createVoiceRedemption,
  transcribeVoiceNote,
} from "@/lib/voice-note-contract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let prepared:
    Awaited<ReturnType<typeof prepareHermesVoiceRequest>> | undefined;
  let context: Awaited<ReturnType<typeof requireProjectContext>> | undefined;
  let uploadedAssetId: string | undefined;
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (!Number.isFinite(length) || length <= 0)
      throw new ManagedAssetError("INVALID_ASSET_LENGTH", 411);
    if (length > BROWSER_UPLOAD_BODY_BYTES)
      throw new ManagedAssetError("ASSET_SIZE_LIMIT", 413);
    const form = await request.formData();
    context = await requireProjectContext(String(form.get("projectId") || ""));
    const assignmentId = String(form.get("employeeProjectAssignmentId") || "");
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ManagedAssetError("INVALID_ASSET", 400);
    if (file.size > BROWSER_UPLOAD_FILE_BYTES)
      throw new ManagedAssetError("ASSET_SIZE_LIMIT", 413);
    const asset = await createManagedAsset(context, "VOICE_NOTE", file);
    uploadedAssetId = asset.id;
    prepared = await prepareHermesVoiceRequest(context, assignmentId, asset.id);
    const body = await createVoiceRedemption({
      projectId: context.project.id,
      runtimeId: prepared.runtimeId,
      runtimeAssignmentId: prepared.runtimeAssignmentId,
      profileId: prepared.profileId,
      conversationId: prepared.conversationId,
      messageId: prepared.messageId,
      assetId: asset.id,
      correlationId: prepared.correlationId,
      authorizedActorId: prepared.authorizedActorId,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      sha256: asset.sha256,
    });
    const receipt = await transcribeVoiceNote(body);
    const result = await sendHermesBotMessage(
      context,
      assignmentId,
      receipt.transcript,
      undefined,
      hermesRuntimeAdapter,
      {
        attachmentAssetIds: [asset.id],
        correlationId: prepared.correlationId,
        requestMessageId: prepared.messageId,
      },
    );
    await prismaReceipt(prepared.messageId, asset.id, receipt.receiptId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (prepared && context) {
      await failHermesVoiceRequest(
        context,
        prepared.messageId,
        prepared.asset.id,
        error instanceof Error ? error.message : "VOICE_TRANSCRIPTION_FAILED",
      ).catch(() => undefined);
    } else if (uploadedAssetId)
      await retireManagedAsset(uploadedAssetId).catch(() => undefined);
    if (error instanceof ManagedAssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    try {
      return projectScopeErrorResponse(error);
    } catch (scopeError) {
      return botErrorResponse(scopeError);
    }
  }
}

async function prismaReceipt(
  messageId: string,
  assetId: string,
  receiptId: string,
) {
  const { prisma } = await import("@/lib/prisma");
  await prisma.messageAttachment.updateMany({
    where: { messageId, assetId },
    data: { state: "READY", processingReceiptId: receiptId, errorCode: null },
  });
}
