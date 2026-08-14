import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectScopeErrorResponse, requireProjectContextForRequest } from "@/lib/project-scope";

export async function GET(req: Request) {
  try {
  const context = await requireProjectContextForRequest(req);
  const row = await prisma.projectDataStore.findUnique({ where: { projectId_namespace_key: { projectId: context.project.id, namespace: "hermes", key: "cost" } } });
  return NextResponse.json(row?.data ?? { summary: null, byModel: [], totalCost: null, totalTokens: null, syncedAt: null });
  } catch (error) { return projectScopeErrorResponse(error); }
}
