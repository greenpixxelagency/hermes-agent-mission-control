import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from "@/lib/project-scope";

export async function GET(req: Request) {
  try {
  const context = await requireProjectContextForRequest(req);
  const row = await prisma.projectDataStore.findUnique({ where: { projectId_namespace_key: { projectId: context.project.id, namespace: "hermes", key: "briefing" } } });
  return NextResponse.json(row?.data ?? { generatedAt: null, summary: null, sections: [] });
  } catch (error) { return projectScopeErrorResponse(error); }
}

// POST → ask the bridge to (re)generate the chief-of-staff brief now.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
  const context = await requireProjectContextForBody(b);
  const row = await prisma.agentRequest.create({
    data: {
      projectId: context.project.id,
      origin: "web",
      kind: "briefing.generate",
      title: "Generate chief-of-staff brief",
      prompt: "now",
      sideEffecting: false,
      status: "queued",
    },
  });
  return NextResponse.json({ request: row });
  } catch (error) { return projectScopeErrorResponse(error); }
}
