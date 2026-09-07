import { NextResponse } from "next/server";

import { getHermesBotAssignment } from "@/lib/hermes-bots";
import { botErrorResponse } from "@/lib/hermes-bot-api";
import { hermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import {
  projectScopeErrorResponse,
  requireProjectContextForRequest,
} from "@/lib/project-scope";

const bool = (value: unknown) => value === true;

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request);
    const employeeProjectAssignmentId =
      new URL(request.url).searchParams.get("employeeProjectAssignmentId") ||
      "";
    const assignment = await getHermesBotAssignment(
      context,
      employeeProjectAssignmentId,
    );
    const observed = await hermesRuntimeAdapter.getBindingCapabilities(
      assignment.id,
    );
    // This is intentionally an allowlist projection. It contains no runtime
    // URL, credential, command, session data, or adapter implementation detail.
    return NextResponse.json(
      {
        browser: {
          viewerLease: bool(observed.capabilities.browserViewerLeaseAvailable),
          takeover:
            bool(observed.capabilities.browserTakeoverAvailable) &&
            bool(observed.capabilities.browserViewerLeaseAvailable),
        },
        teach: {
          observation: bool(observed.capabilities.teachObservationAvailable),
        },
        model: {
          catalog: bool(observed.capabilities.modelCatalogAvailable),
          approved: observed.approvedModels,
        },
        mcp: { managed: bool(observed.capabilities.mcpAvailable) },
        routines: {
          managed: bool(observed.capabilities.routineMutationAvailable),
        },
        runtime: {
          gatewayRestart: bool(observed.capabilities.gatewayRestartAvailable),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    try {
      return projectScopeErrorResponse(error);
    } catch (scopeError) {
      try {
        return botErrorResponse(scopeError);
      } catch {
        return NextResponse.json(
          {
            browser: { viewerLease: false, takeover: false },
            teach: { observation: false },
            model: { catalog: false, approved: [] },
            mcp: { managed: false },
            routines: { managed: false },
            runtime: { gatewayRestart: false },
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
  }
}
