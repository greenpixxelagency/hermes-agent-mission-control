import { NextResponse } from "next/server";

import { botErrorResponse } from "@/lib/hermes-bot-api";
import {
  failHermesVoiceRequest,
  prepareHermesVoiceRetry,
  sendHermesBotMessage,
} from "@/lib/hermes-bots";
import { hermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import { ManagedAssetError } from "@/lib/managed-assets";
import { prisma } from "@/lib/prisma";
import {
  projectScopeErrorResponse,
  requireProjectContextForBody,
} from "@/lib/project-scope";
import {
  createVoiceRedemption,
  transcribeVoiceNote,
} from "@/lib/voice-note-contract";

export async function POST(request: Request) {
  let prepared: Awaited<ReturnType<typeof prepareHermesVoiceRetry>> | undefined;
  let context:
    | Awaited<ReturnType<typeof requireProjectContextForBody>>
    | undefined;
  try {
    const input = (await request.json()) as Record<string, unknown>;
    context = await requireProjectContextForBody(input);
    prepared = await prepareHermesVoiceRetry(
      context,
      typeof input.employeeProjectAssignmentId === "string"
        ? input.employeeProjectAssignmentId
        : "",
      typeof input.messageId === "string" ? input.messageId : "",
    );
    const body = await createVoiceRedemption({
      projectId: context.project.id,
      runtimeId: prepared.runtimeId,
      runtimeAssignmentId: prepared.runtimeAssignmentId,
      profileId: prepared.profileId,
      conversationId: prepared.conversationId,
      messageId: prepared.messageId,
      assetId: prepared.asset.id,
      correlationId: prepared.correlationId,
      authorizedActorId: prepared.authorizedActorId,
      mimeType: prepared.asset.mimeType,
      byteLength: prepared.asset.byteLength,
      sha256: prepared.asset.sha256,
    });
    const receipt = await transcribeVoiceNote(body);
    const result = await sendHermesBotMessage(
      context,
      typeof input.employeeProjectAssignmentId === "string"
        ? input.employeeProjectAssignmentId
        : "",
      receipt.transcript,
      undefined,
      hermesRuntimeAdapter,
      {
        attachmentAssetIds: [prepared.asset.id],
        correlationId: prepared.correlationId,
        requestMessageId: prepared.messageId,
      },
    );
    await prisma.messageAttachment.updateMany({
      where: {
        projectId: context.project.id,
        messageId: prepared.messageId,
        assetId: prepared.asset.id,
      },
      data: {
        state: "READY",
        processingReceiptId: receipt.receiptId,
        errorCode: null,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (prepared && context)
      await failHermesVoiceRequest(
        context,
        prepared.messageId,
        prepared.asset.id,
        error instanceof Error ? error.message : "VOICE_TRANSCRIPTION_FAILED",
      ).catch(() => undefined);
    if (error instanceof ManagedAssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    try {
      return projectScopeErrorResponse(error);
    } catch (scopeError) {
      return botErrorResponse(scopeError);
    }
  }
}
