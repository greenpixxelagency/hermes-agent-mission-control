import { NextResponse } from "next/server";
import { AuditActorType } from "@prisma/client";

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
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(profileId))
      return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400 });
    const runtime = await prisma.hermesRuntime.findFirst({
      where: { key: "rogeros-hermes-staging", status: "ACTIVE" },
      select: { id: true },
    });
    if (!runtime)
      return NextResponse.json(
        { error: "HERMES_RUNTIME_UNAVAILABLE" },
        { status: 409 },
      );

    // This is an explicit Owner/Admin adoption request. Reconciliation sends
    // the opaque RogerOS IDs to the adapter, which verifies profile existence
    // and rejects a profile already immutably bound elsewhere. We deliberately
    // never enumerate Hermes' raw profile inventory in RogerOS.
    if (
      await prisma.hermesRuntimeAssignment.findFirst({
        where: { projectId: context.project.id, profileKey: profileId },
        select: { id: true },
      })
    ) {
      return NextResponse.json(
        { error: "BOT_PROFILE_ALREADY_EXISTS" },
        { status: 409 },
      );
    }

    const created = await createCustomEmployee(context, {
      name: typeof body.name === "string" ? body.name : profileId,
      role: body.role,
      description:
        typeof body.description === "string" ? body.description : null,
    });
    const runtimeAssignment = await prisma.hermesRuntimeAssignment.create({
      data: {
        projectId: context.project.id,
        runtimeId: runtime.id,
        employeeProjectAssignmentId: created.assignment.id,
        profileKey: profileId,
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
      metadata: { profileId, capabilityGrants: "NONE" },
    });
    try {
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
    } catch {
      return NextResponse.json(
        {
          employeeAssignment: created.assignment,
          provisioning: "PENDING_RECONCILIATION",
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
