import { NextResponse } from "next/server";
import {
  BROWSER_UPLOAD_BODY_BYTES,
  BROWSER_UPLOAD_FILE_BYTES,
  ManagedAssetError,
  createManagedAsset,
  retireManagedAsset,
  setUploadedAvatar,
} from "@/lib/managed-assets";
import { requireProjectContext } from "@/lib/project-context";
import { projectScopeErrorResponse } from "@/lib/project-scope";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (!Number.isFinite(length) || length <= 0)
      throw new ManagedAssetError("INVALID_ASSET_LENGTH", 411);
    if (length > BROWSER_UPLOAD_BODY_BYTES)
      throw new ManagedAssetError("ASSET_SIZE_LIMIT", 413);
    const form = await request.formData();
    const context = await requireProjectContext(
      String(form.get("projectId") || ""),
    );
    const kindValue = String(form.get("kind") || "");
    const kind =
      kindValue === "avatar"
        ? "AVATAR"
        : kindValue === "voice"
          ? "VOICE_NOTE"
          : kindValue === "document"
            ? "DOCUMENT"
            : null;
    const file = form.get("file");
    if (!kind || !(file instanceof File))
      throw new ManagedAssetError("INVALID_ASSET", 400);
    if (file.size > BROWSER_UPLOAD_FILE_BYTES)
      throw new ManagedAssetError("ASSET_SIZE_LIMIT", 413);
    const asset = await createManagedAsset(context, kind, file);
    if (kind === "AVATAR") {
      const assignmentId = String(
        form.get("employeeProjectAssignmentId") || "",
      );
      try {
        const selected = await setUploadedAvatar(
          context,
          assignmentId,
          asset.id,
        );
        if (selected.previousAvatarAssetId)
          await retireManagedAsset(selected.previousAvatarAssetId).catch(
            () => undefined,
          );
      } catch (error) {
        await retireManagedAsset(asset.id).catch(() => undefined);
        throw error;
      }
    }
    return NextResponse.json(
      {
        id: asset.id,
        kind: asset.kind,
        safeName: asset.safeName,
        mimeType: asset.mimeType,
        byteLength: asset.byteLength,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        state: asset.state,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ManagedAssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    return projectScopeErrorResponse(error);
  }
}
