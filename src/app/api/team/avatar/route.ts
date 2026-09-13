import { NextResponse } from "next/server";
import {
  projectScopeErrorResponse,
  requireProjectContextForBody,
} from "@/lib/project-scope";
import { setTeamAvatarPreset, TeamAvatarError } from "@/lib/team-avatar";
import {
  ManagedAssetError,
  retireManagedAsset,
  setUploadedAvatar,
} from "@/lib/managed-assets";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const assignmentId =
      typeof body.employeeProjectAssignmentId === "string"
        ? body.employeeProjectAssignmentId
        : "";
    const updated = await setTeamAvatarPreset(
      context,
      assignmentId,
      body.avatarPresetKey,
    );
    if (updated.previousAvatarAssetId)
      await retireManagedAsset(updated.previousAvatarAssetId).catch(
        () => undefined,
      );
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof TeamAvatarError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "ASSIGNMENT_NOT_FOUND"
            ? 404
            : 400;
      return NextResponse.json(
        {
          error:
            error.code === "ASSIGNMENT_NOT_FOUND" ? "Not found" : error.code,
        },
        { status },
      );
    }
    return projectScopeErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const updated = await setUploadedAvatar(
      context,
      typeof body.employeeProjectAssignmentId === "string"
        ? body.employeeProjectAssignmentId
        : "",
      null,
    );
    if (updated.previousAvatarAssetId)
      await retireManagedAsset(updated.previousAvatarAssetId).catch(
        () => undefined,
      );
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ManagedAssetError)
      return NextResponse.json(
        { error: error.code === "NOT_FOUND" ? "Not found" : error.code },
        { status: error.status },
      );
    return projectScopeErrorResponse(error);
  }
}
