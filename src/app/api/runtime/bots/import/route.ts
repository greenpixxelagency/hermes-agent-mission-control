import { NextResponse } from "next/server";
import { AuditActorType } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { recordAuditEvent } from "@/lib/audit";
import { reconcileHermesBotAssignment } from "@/lib/hermes-bots";
import {
  EmployeeMarketError,
  createCustomEmployee,
} from "@/lib/employee-market";
import { hermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import { prisma } from "@/lib/prisma";
import {
  projectScopeErrorResponse,
  requireProjectContextForBody,
} from "@/lib/project-scope";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const claimId = typeof body.claimId === "string" ? body.claimId : "";
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(claimId))
      return NextResponse.json({ error: "INVALID_CLAIM" }, { status: 400 });
    const runtime = await prisma.hermesRuntime.findFirst({
      where: { key: "rogeros-hermes-staging", status: "ACTIVE" },
      select: { id: true },
    });
    if (!runtime)
      return NextResponse.json(
        { error: "HERMES_RUNTIME_UNAVAILABLE" },
        { status: 409 },
      );

    const created = await createCustomEmployee(context, {
      name: typeof body.name === "string" ? body.name : "Claimed Hermes profile",
      role: body.role,
      description:
        typeof body.description === "string" ? body.description : null,
    });
    // The opaque UUID lets the adapter atomically consume the claim and bind
    // this exact future RogerOS record. The client never submits a profile ID.
    const runtimeAssignmentId = randomUUID();
    const runtimeAssignment = await prisma.hermesRuntimeAssignment.create({
      data: {
        id: runtimeAssignmentId,
        projectId: context.project.id,
        runtimeId: runtime.id,
        employeeProjectAssignmentId: created.assignment.id,
        profileKey: `claim-pending-${runtimeAssignmentId}`,
        active: true,
      },
    });
    const actor = await prisma.projectMember.findFirst({
      where: {
        projectId: context.project.id,
        organizationMember: { userId: context.user.id },
      },
      select: { id: true },
    });
    if (!actor)
      return NextResponse.json(
        { error: "PROFILE_NOT_AVAILABLE" },
        { status: 404 },
      );
    await recordAuditEvent({
      projectId: context.project.id,
      eventType: "runtime.bot.adoption.requested",
      actor: { type: AuditActorType.HUMAN, projectMemberId: actor.id },
      targetType: "HermesRuntimeAssignment",
      targetId: runtimeAssignment.id,
      summary: "Hermes profile adoption requested for RogerOS workforce",
      metadata: { claimConsumed: true, capabilityGrants: "NONE" },
    });
    try {
      const binding = await hermesRuntimeAdapter.claimProfileBinding({ claimId, projectId: context.project.id, runtimeId: runtime.id, runtimeAssignmentId });
      await prisma.hermesRuntimeAssignment.update({ where: { id: runtimeAssignment.id }, data: { profileKey: binding.profileId } });
      const assignment = await reconcileHermesBotAssignment(
        context,
        created.assignment.id,
        hermesRuntimeAdapter,
      );
      return NextResponse.json(
        {
          employeeAssignment: created.assignment,
          runtimeAssignment: assignment,
        },
        { status: 201 },
      );
    } catch (error) {
      const code = error instanceof Error && /^HERMES_ADAPTER_(?:NOT_CONFIGURED|\d{3}_[A-Z0-9_]{1,200})$/.test(error.message) ? error.message : "ADOPTION_REQUIRES_RETRY";
      await prisma.hermesRuntimeAssignment.update({ where: { id: runtimeAssignment.id }, data: { provisioningState: "FAILED", reconciliationState: "FAILED", lastReconcileError: code } });
      return NextResponse.json(
        {
          employeeAssignment: created.assignment,
          provisioning: "PENDING_RECONCILIATION",
          error: code,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    if (error instanceof EmployeeMarketError)
      return NextResponse.json(
        {
          error:
            error.code === "FORBIDDEN"
              ? "Forbidden"
              : "Name and role are required",
        },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    try {
      return projectScopeErrorResponse(error);
    } catch {
      return NextResponse.json(
        { error: "IMPORT_UNAVAILABLE" },
        { status: 503 },
      );
    }
  }
}
