import { NextResponse } from "next/server";
import { AuditActorType } from "@prisma/client";

import { recordAuditEvent } from "@/lib/audit";
import { botErrorResponse } from "@/lib/hermes-bot-api";
import { HermesBotError, getHermesBotAssignment } from "@/lib/hermes-bots";
import { hermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import { prisma } from "@/lib/prisma";
import {
  projectScopeErrorResponse,
  requireProjectContextForBody,
} from "@/lib/project-scope";

const managers = new Set(["OWNER", "ADMIN"]);

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    if (!managers.has(context.project.role))
      throw new HermesBotError("FORBIDDEN");
    const employeeProjectAssignmentId =
      typeof body.employeeProjectAssignmentId === "string"
        ? body.employeeProjectAssignmentId
        : "";
    const provider = typeof body.provider === "string" ? body.provider : "";
    const modelId = typeof body.modelId === "string" ? body.modelId : "";
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/.test(provider) ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,239}$/.test(modelId)
    )
      throw new HermesBotError("INVALID_MODEL_SELECTION");

    const assignment = await getHermesBotAssignment(
      context,
      employeeProjectAssignmentId,
    );
    const observed = await hermesRuntimeAdapter.getBindingCapabilities(
      assignment.id,
    );
    if (
      !observed.capabilities.modelCatalogAvailable ||
      !observed.approvedModels.some(
        (model) => model.provider === provider && model.modelId === modelId,
      )
    )
      throw new HermesBotError("MODEL_NOT_APPROVED");

    const configured = await hermesRuntimeAdapter.updateBotRuntimeConfig(
      assignment.profileKey,
      { provider, modelId },
    );
    if (configured.profileId !== assignment.profileKey)
      throw new HermesBotError("ADAPTER_MALFORMED_RESPONSE");

    const actor = await prisma.projectMember.findFirst({
      where: {
        projectId: context.project.id,
        organizationMember: { userId: context.user.id },
      },
      select: { id: true },
    });
    if (!actor) throw new HermesBotError("FORBIDDEN");
    const saved = await prisma.hermesRuntimeAssignment.update({
      where: { id: assignment.id },
      data: { desiredModelProvider: provider, desiredModelId: modelId },
    });
    await recordAuditEvent({
      projectId: context.project.id,
      eventType: "runtime.bot.model.updated",
      actor: { type: AuditActorType.HUMAN, projectMemberId: actor.id },
      targetType: "HermesRuntimeAssignment",
      targetId: assignment.id,
      summary: "Approved Hermes bot model changed",
      metadata: { provider, modelId },
    });
    return NextResponse.json({
      assignment: {
        id: saved.id,
        desiredModelProvider: saved.desiredModelProvider,
        desiredModelId: saved.desiredModelId,
      },
    });
  } catch (error) {
    try {
      return projectScopeErrorResponse(error);
    } catch (scopeError) {
      try {
        return botErrorResponse(scopeError);
      } catch {
        return NextResponse.json(
          { error: "MODEL_UPDATE_UNAVAILABLE" },
          { status: 503 },
        );
      }
    }
  }
}
