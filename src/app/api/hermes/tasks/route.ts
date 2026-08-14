import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectScopeErrorResponse, requireProjectContextForRequest } from "@/lib/project-scope";

export async function GET(req: Request) {
  try {
  const context = await requireProjectContextForRequest(req);
  const tasks = await prisma.hermesTask.findMany({ where: { projectId: context.project.id }, orderBy: [{ status: "asc" }, { priority: "desc" }], take: 200 });
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  const lastSync = tasks[0]?.syncedAt ?? null;
  return NextResponse.json({ tasks, counts, total: tasks.length, lastSync });
  } catch (error) { return projectScopeErrorResponse(error); }
}
