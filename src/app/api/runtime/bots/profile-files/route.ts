import { NextResponse } from "next/server";
import { employeeStudioErrorResponse } from "@/lib/employee-studio-api";
import { readEmployeeStudioProfileFile, writeEmployeeStudioProfileFile } from "@/lib/employee-studio";
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from "@/lib/project-scope";

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await readEmployeeStudioProfileFile(context, params.get("employeeProjectAssignmentId") || "", params.get("logicalKey") || ""), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    try { return projectScopeErrorResponse(error); }
    catch (scopeError) { return employeeStudioErrorResponse(scopeError); }
  }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const context = await requireProjectContextForBody(body);
    const result = await writeEmployeeStudioProfileFile(context, {
      employeeProjectAssignmentId: typeof body.employeeProjectAssignmentId === "string" ? body.employeeProjectAssignmentId : "",
      logicalKey: typeof body.logicalKey === "string" ? body.logicalKey : "",
      expectedDigest: typeof body.expectedDigest === "string" ? body.expectedDigest : "",
      content: typeof body.content === "string" ? body.content : undefined,
      restoreVersion: typeof body.restoreVersion === "number" ? body.restoreVersion : undefined,
      idempotencyKey: request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json(result);
  } catch (error) {
    try { return projectScopeErrorResponse(error); }
    catch (scopeError) { return employeeStudioErrorResponse(scopeError); }
  }
}
