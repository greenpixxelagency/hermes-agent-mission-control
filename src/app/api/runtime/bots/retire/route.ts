import { NextResponse } from "next/server";

import { botErrorResponse } from "@/lib/hermes-bot-api";
import { retireHermesBotAssignment } from "@/lib/hermes-bots";
import {
  projectScopeErrorResponse,
  requireProjectContextForBody,
} from "@/lib/project-scope";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const assignmentId =
      typeof body.employeeProjectAssignmentId === "string"
        ? body.employeeProjectAssignmentId
        : "";
    const assignment = await retireHermesBotAssignment(context, assignmentId);
    return NextResponse.json({
      receipt: {
        operation: "RETIRE_BOT",
        status: "RETIRED",
        runtimeAssignmentId: assignment.id,
      },
    });
  } catch (error) {
    try {
      return projectScopeErrorResponse(error);
    } catch (scopeError) {
      return botErrorResponse(scopeError);
    }
  }
}
