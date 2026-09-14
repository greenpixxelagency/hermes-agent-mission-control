import { NextResponse } from "next/server";
import { employeeStudioErrorResponse } from "@/lib/employee-studio-api";
import { readEmployeeStudio } from "@/lib/employee-studio";
import { projectScopeErrorResponse, requireProjectContextForRequest } from "@/lib/project-scope";

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request);
    const employeeProjectAssignmentId = new URL(request.url).searchParams.get("employeeProjectAssignmentId") || "";
    return NextResponse.json(await readEmployeeStudio(context, employeeProjectAssignmentId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    try { return projectScopeErrorResponse(error); }
    catch (scopeError) { return employeeStudioErrorResponse(scopeError); }
  }
}
