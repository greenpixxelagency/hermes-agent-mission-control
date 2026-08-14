import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectScopeErrorResponse, requireProjectContextForRequest } from "@/lib/project-scope";
export async function GET(req: Request) {
  try {
  const context = await requireProjectContextForRequest(req);
  const row = await prisma.projectDataStore.findUnique({ where: { projectId_namespace_key: { projectId: context.project.id, namespace: "hermes", key: "health" } } });
  return NextResponse.json(row?.data ?? { online: false, gateway: "unknown", lastSeen: null });
  } catch (error) { return projectScopeErrorResponse(error); }
}
