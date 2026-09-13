import { NextResponse } from "next/server";

import { ManagedAssetError } from "@/lib/managed-assets";
import { redeemVoiceAsset } from "@/lib/voice-note-contract";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const authorization = request.headers.get("authorization") || "";
    const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization);
    if (!match) throw new ManagedAssetError("INVALID_REDEMPTION", 401);
    const { asset, bytes } = await redeemVoiceAsset(
      assetId,
      match[1],
      request.headers.get("accept") || "",
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="voice-note.${asset.mimeType.split("/")[1] || "bin"}"`,
        "Content-Length": String(bytes.length),
        "Content-Type": asset.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof ManagedAssetError ? error.status : 500;
    const code =
      error instanceof ManagedAssetError ? error.code : "REDEMPTION_FAILED";
    return NextResponse.json({ error: code }, { status });
  }
}
