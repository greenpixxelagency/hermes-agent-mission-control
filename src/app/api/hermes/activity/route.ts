import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectScopeErrorResponse, requireProjectContextForRequest } from "@/lib/project-scope";

export async function GET(req: Request) {
  try {
  const context = await requireProjectContextForRequest(req);
  const take = Math.min(Number(new URL(req.url).searchParams.get("take") || 40), 100);
  const events = await prisma.agentEvent.findMany({ where: { projectId: context.project.id }, orderBy: { createdAt: "desc" }, take });
  return NextResponse.json({ events });
  } catch (error) { return projectScopeErrorResponse(error); }
}
