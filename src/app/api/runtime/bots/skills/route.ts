import { NextResponse } from "next/server";
import { employeeStudioErrorResponse } from "@/lib/employee-studio-api";
import { reconcileEmployeeStudioSkill } from "@/lib/employee-studio";
import { projectScopeErrorResponse, requireProjectContextForBody } from "@/lib/project-scope";

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    return NextResponse.json(await reconcileEmployeeStudioSkill(context, {
      employeeProjectAssignmentId: typeof body.employeeProjectAssignmentId === "string" ? body.employeeProjectAssignmentId : "",
      skillId: typeof body.skillId === "string" ? body.skillId : "",
      expectedVersion: typeof body.expectedVersion === "string" ? body.expectedVersion : "",
      enabled: body.enabled === true,
      idempotencyKey: request.headers.get("idempotency-key") || "",
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    try { return projectScopeErrorResponse(error); }
    catch (scopeError) { return employeeStudioErrorResponse(scopeError); }
  }
}
