import { NextResponse } from "next/server";
import { EmployeeStudioError } from "@/lib/employee-studio";

export function employeeStudioErrorResponse(error: unknown) {
  if (!(error instanceof EmployeeStudioError)) throw error;
  const status = error.code === "FORBIDDEN" ? 403
    : error.code.endsWith("NOT_FOUND") ? 404
      : error.code.includes("SETUP_REQUIRED") || error.code.includes("UNAVAILABLE") ? 503
        : error.code.includes("STALE") || error.code.includes("IN_PROGRESS") || error.code.includes("REUSED") ? 409
          : error.code.includes("ROLLBACK_FAILED") ? 502
            : 400;
  return NextResponse.json({ error: error.code }, { status, headers: { "Cache-Control": "no-store" } });
}
