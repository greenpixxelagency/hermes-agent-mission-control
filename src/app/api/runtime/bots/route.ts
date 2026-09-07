import { NextResponse } from "next/server";

import { hermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import { botProfileId, reconcileHermesBotAssignment } from "@/lib/hermes-bots";
import {
  EmployeeMarketError,
  createCustomEmployee,
} from "@/lib/employee-market";
import { prisma } from "@/lib/prisma";
import {
  projectScopeErrorResponse,
  requireProjectContextForBody,
  requireProjectContextForRequest,
} from "@/lib/project-scope";

const safeBot = (bot: {
  profileId: string;
  displayName: string;
  description?: string | null;
  state: string;
  modelProvider?: string | null;
  modelId?: string | null;
}) => ({
  profileId: bot.profileId,
  displayName: bot.displayName,
  description: bot.description ?? null,
  state: bot.state,
  modelProvider: bot.modelProvider ?? null,
  modelId: bot.modelId ?? null,
});

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request);
    // The adapter stores immutable project/profile bindings. Project slugs are
    // mutable and only organization-unique, so must never scope runtime reads.
    const bots = await hermesRuntimeAdapter.listProjectBots(context.project.id);
    return NextResponse.json(
      { bots: bots.map(safeBot), source: "hermes" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    try {
      return projectScopeErrorResponse(error);
    } catch {
      return NextResponse.json(
        { bots: [], source: "unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const runtime = await prisma.hermesRuntime.findFirst({
      where: { key: "rogeros-hermes-staging", status: "ACTIVE" },
      select: { id: true },
    });
    if (!runtime)
      return NextResponse.json(
        { error: "HERMES_RUNTIME_UNAVAILABLE" },
        { status: 409 },
      );
    const requestedName = typeof body.name === "string" ? body.name.trim() : "";
    const requestedProfileKey = requestedName
      ? botProfileId(context.project.slug, requestedName)
      : "";
    if (
      requestedProfileKey &&
      (await prisma.hermesRuntimeAssignment.findFirst({
        where: {
          projectId: context.project.id,
          profileKey: requestedProfileKey,
        },
        select: { id: true },
      }))
    ) {
      return NextResponse.json(
        { error: "BOT_PROFILE_ALREADY_EXISTS" },
        { status: 409 },
      );
    }
    const created = await createCustomEmployee(context, body);
    const profileKey = botProfileId(
      context.project.slug,
      created.employee.systemKey || created.employee.name,
    );
    await prisma.hermesRuntimeAssignment.create({
      data: {
        projectId: context.project.id,
        runtimeId: runtime.id,
        employeeProjectAssignmentId: created.assignment.id,
        profileKey,
        active: true,
      },
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
      // The assignment is intentionally retained in a failed/reconciling state
      // so the owner can retry after the typed adapter is healthy. We never
      // pretend that creating an employee provisioned a live Hermes profile.
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
    return projectScopeErrorResponse(error);
  }
}
