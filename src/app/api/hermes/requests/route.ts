import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectScopeErrorResponse, requireProjectContextForRequest } from "@/lib/project-scope";

export async function GET(req: Request) {
  try {
  const context = await requireProjectContextForRequest(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // e.g. "awaiting_approval"
  const take = Math.min(Number(url.searchParams.get("take") || 50), 200);
  const where = { projectId: context.project.id, ...(status ? { status: { in: status.split(",") } } : {}) };
  const requests = await prisma.agentRequest.findMany({
    where, orderBy: { createdAt: "desc" }, take,
  });
  const pending = await prisma.agentRequest.count({ where: { projectId: context.project.id, status: "awaiting_approval" } });
  return NextResponse.json({ requests, pending });
  } catch (error) { return projectScopeErrorResponse(error); }
}
