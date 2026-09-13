import { ProjectRole } from "@prisma/client";

import { hermesAdapterConfigured, hermesRuntimeAdapter, type HermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import type { ProjectContext } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";

const managers = new Set<ProjectRole>(["OWNER", "ADMIN"]);
const operators = new Set<ProjectRole>(["OWNER", "ADMIN", "OPERATOR"]);
export type TeamDeskState = "SETUP_REQUIRED" | "ADAPTER_UNAVAILABLE" | "READY_EMPTY" | "ACTIVE_ROSTER" | "NEEDS_ATTENTION";

export function deriveTeamDeskState(input: { configured: boolean; adapterReachable: boolean; retainedCount: number; inventoryCount: number; needsAttention: boolean }): TeamDeskState {
  if (!input.configured) return "SETUP_REQUIRED";
  if (!input.adapterReachable) return "ADAPTER_UNAVAILABLE";
  if (input.needsAttention) return "NEEDS_ATTENTION";
  return input.retainedCount > 0 || input.inventoryCount > 0 ? "ACTIVE_ROSTER" : "READY_EMPTY";
}

export function teamDeskAllowedActions(role: ProjectRole, state: TeamDeskState, retainedCount: number) {
  const healthy = state === "READY_EMPTY" || state === "ACTIVE_ROSTER" || state === "NEEDS_ATTENTION";
  return { add: managers.has(role) && healthy, adopt: managers.has(role) && healthy, retry: managers.has(role) && retainedCount > 0 && state !== "SETUP_REQUIRED", chat: operators.has(role) };
}

function safeFailure(error: unknown) {
  if (error instanceof Error && /^HERMES_ADAPTER_(?:NOT_CONFIGURED|\d{3}_[A-Z0-9_]{1,200})$/.test(error.message)) return error.message;
  return "ADAPTER_UNAVAILABLE";
}

export async function readTeamDesk(context: ProjectContext, adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  const assignments = await prisma.employeeProjectAssignment.findMany({
    where: { projectId: context.project.id },
    include: {
      employee: { select: { name: true, role: true, description: true } },
      runtimeAssignments: { include: { runtime: { select: { status: true } } } },
      _count: { select: { taskAssignments: true } },
    },
    orderBy: { employee: { name: "asc" } },
  });
  const retained = assignments.flatMap((employee) => employee.runtimeAssignments.filter((runtime) => runtime.active && runtime.assignmentState !== "RETIRED").map((runtime) => ({
    employeeAssignmentId: employee.id,
    profileKey: runtime.profileKey,
    displayName: employee.employee.name,
    role: employee.roleOverride || employee.employee.role,
    description: employee.employee.description,
    avatarPresetKey: employee.avatarPresetKey,
    taskCount: employee._count.taskAssignments,
    assignmentState: runtime.assignmentState,
    provisioningState: runtime.provisioningState,
    reconciliationState: runtime.reconciliationState,
    runtimeStatus: runtime.runtimeStatus,
    active: runtime.active,
    provenance: "ROGEROS_ASSIGNMENT" as const,
    lastReconciledAt: runtime.lastReconciledAt?.toISOString() ?? null,
  })));
  const common = { retained, lastRefresh: new Date().toISOString() };
  if (!hermesAdapterConfigured()) return { ...common, state: "SETUP_REQUIRED" as const, failureCode: "HERMES_ADAPTER_NOT_CONFIGURED", inventory: [], claimableProfiles: [], allowedActions: teamDeskAllowedActions(context.project.role, "SETUP_REQUIRED", retained.length), provenance: "RETAINED_ROGEROS_ASSIGNMENTS" as const };
  try {
    const adapterNamespace = process.env.ROGEROS_HERMES_ADAPTER_PROJECT_ID?.trim() || context.project.id;
    const [health, inventory] = await Promise.all([
      adapter.health(),
      adapter.listProjectBots(adapterNamespace),
    ]);
    if (!health.hermesReachable) throw new Error("HERMES_ADAPTER_503_HEALTH");
    let claimableProfiles = [] as Awaited<ReturnType<HermesRuntimeAdapter["listClaimableProfiles"]>>;
    let claimFailureCode: string | null = null;
    if (managers.has(context.project.role)) {
      try {
        claimableProfiles = await adapter.listClaimableProfiles();
      } catch (error) {
        // Claim discovery is optional. It must not hide a healthy signed
        // project roster or disable existing bot chat.
        claimFailureCode = safeFailure(error);
      }
    }
    const state = deriveTeamDeskState({ configured: true, adapterReachable: true, retainedCount: retained.length, inventoryCount: inventory.length, needsAttention: retained.some((row) => row.provisioningState === "FAILED" || row.reconciliationState === "FAILED") });
    const allowedActions = teamDeskAllowedActions(context.project.role, state, retained.length);
    return { ...common, state, failureCode: null, claimFailureCode, inventory: inventory.map((bot) => ({ profileId: bot.profileId, displayName: bot.displayName, description: bot.description ?? null, state: bot.state, modelProvider: bot.modelProvider ?? null, modelId: bot.modelId ?? null })), claimableProfiles, allowedActions: { ...allowedActions, adopt: allowedActions.adopt && !claimFailureCode }, provenance: "SIGNED_PROJECT_BINDING" as const };
  } catch (error) {
    return { ...common, state: "ADAPTER_UNAVAILABLE" as const, failureCode: safeFailure(error), inventory: [], claimableProfiles: [], allowedActions: teamDeskAllowedActions(context.project.role, "ADAPTER_UNAVAILABLE", retained.length), provenance: "RETAINED_ROGEROS_ASSIGNMENTS" as const };
  }
}
