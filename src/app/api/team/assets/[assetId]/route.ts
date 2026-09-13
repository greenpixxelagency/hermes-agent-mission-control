import { NextResponse } from "next/server";
import { ManagedAssetError, readManagedAsset } from "@/lib/managed-assets";
import {
  requireProjectContextForRequest,
  projectScopeErrorResponse,
} from "@/lib/project-scope";

export const runtime = "nodejs";

function disposition(name: string, inline: boolean) {
  return `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^a-zA-Z0-9._ -]/g, "-").slice(0, 120)}"`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const context = await requireProjectContextForRequest(request);
    const { assetId } = await params;
    const { asset, bytes } = await readManagedAsset(context, assetId);
    const range = request.headers.get("range");
    const match = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
    let body = bytes;
    let status = 200;
    const headers: Record<string, string> = {
      "Content-Type": asset.mimeType,
      "Content-Disposition": disposition(
        asset.safeName,
        ["AVATAR", "IMAGE", "VOICE_NOTE"].includes(asset.kind),
      ),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Accept-Ranges": "bytes",
    };
    if (range) {
      if (!match) return new NextResponse(null, { status: 416 });
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : bytes.length - 1;
      if (start < 0 || end < start || end >= bytes.length)
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${bytes.length}` },
        });
      body = bytes.subarray(start, end + 1);
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
    }
    headers["Content-Length"] = String(body.length);
    return new NextResponse(new Uint8Array(body), {
      status,
      headers,
    });
  } catch (error) {
    if (error instanceof ManagedAssetError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    return projectScopeErrorResponse(error);
  }
}
