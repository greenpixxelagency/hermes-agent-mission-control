import { NextResponse } from "next/server";
import { projectScopeErrorResponse, requireProjectContextForBody } from "@/lib/project-scope";
import { setTeamAvatarPreset, TeamAvatarError } from "@/lib/team-avatar";

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const assignmentId = typeof body.employeeProjectAssignmentId === "string" ? body.employeeProjectAssignmentId : "";
    return NextResponse.json(await setTeamAvatarPreset(context, assignmentId, body.avatarPresetKey));
  } catch (error) {
    if (error instanceof TeamAvatarError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "ASSIGNMENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code === "ASSIGNMENT_NOT_FOUND" ? "Not found" : error.code }, { status });
    }
    return projectScopeErrorResponse(error);
  }
}
