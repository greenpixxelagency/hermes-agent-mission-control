import { NextResponse } from "next/server";
import { employeeStudioErrorResponse } from "@/lib/employee-studio-api";
import { reconcileEmployeeStudioMcp } from "@/lib/employee-studio";
import { projectScopeErrorResponse, requireProjectContextForBody } from "@/lib/project-scope";

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const result = await reconcileEmployeeStudioMcp(context, {
      employeeProjectAssignmentId: typeof body.employeeProjectAssignmentId === "string" ? body.employeeProjectAssignmentId : "",
      serverKey: typeof body.serverKey === "string" ? body.serverKey : "",
      projectConnectionId: typeof body.projectConnectionId === "string" ? body.projectConnectionId : "",
      enabled: body.enabled === true,
      toolKeys: Array.isArray(body.toolKeys) ? body.toolKeys.filter((value): value is string => typeof value === "string") : [],
      expectedRevision: typeof body.expectedRevision === "number" ? body.expectedRevision : 0,
      idempotencyKey: request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json(result);
  } catch (error) {
    try { return projectScopeErrorResponse(error); }
    catch (scopeError) { return employeeStudioErrorResponse(scopeError); }
  }
}
