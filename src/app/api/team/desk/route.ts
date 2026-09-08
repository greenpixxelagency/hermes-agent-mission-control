import { NextResponse } from "next/server";

import { requireProjectContextForRequest, projectScopeErrorResponse } from "@/lib/project-scope";
import { readTeamDesk } from "@/lib/team-desk";

export async function GET(request: Request) {
  try {
    // Context is derived from the authenticated member; selectors in the URL
    // are compatibility-only and never become project authority.
    return NextResponse.json(await readTeamDesk(await requireProjectContextForRequest(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectScopeErrorResponse(error); }
}
