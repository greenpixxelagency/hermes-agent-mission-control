import { ProjectRole } from "@prisma/client";

import { hermesAdapterConfigured, hermesRuntimeAdapter, type HermesRuntimeAdapter } from "@/lib/hermes-runtime-adapter";
import type { ProjectContext } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";

const managers = new Set<ProjectRole>(["OWNER", "ADMIN"]);
const operators = new Set<ProjectRole>(["OWNER", "ADMIN", "OPERATOR"]);
export type TeamDeskState = "SETUP_REQUIRED" | "ADAPTER_UNAVAILABLE" | "READY_EMPTY" | "ACTIVE_ROSTER" | "NEEDS_ATTENTION";

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
  const retained = assignments.flatMap((employee) => employee.runtimeAssignments.map((runtime) => ({
    employeeAssignmentId: employee.id,
    displayName: employee.employee.name,
    role: employee.roleOverride || employee.employee.role,
    description: employee.employee.description,
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
  if (!hermesAdapterConfigured()) return { ...common, state: "SETUP_REQUIRED" as const, failureCode: "HERMES_ADAPTER_NOT_CONFIGURED", inventory: [], claimableProfiles: [], allowedActions: { add: false, adopt: false, retry: false, chat: operators.has(context.project.role) }, provenance: "RETAINED_ROGEROS_ASSIGNMENTS" as const };
  try {
    const [health, inventory, claimableProfiles] = await Promise.all([
      adapter.health(),
      adapter.listProjectBots(context.project.id),
      managers.has(context.project.role) ? adapter.listClaimableProfiles() : Promise.resolve([]),
    ]);
    if (!health.hermesReachable) throw new Error("HERMES_ADAPTER_503_HEALTH");
    const state: TeamDeskState = retained.some((row) => row.provisioningState === "FAILED" || row.reconciliationState === "FAILED") ? "NEEDS_ATTENTION" : retained.length || inventory.length ? "ACTIVE_ROSTER" : "READY_EMPTY";
    return { ...common, state, failureCode: null, inventory: inventory.map((bot) => ({ displayName: bot.displayName, description: bot.description ?? null, state: bot.state, modelProvider: bot.modelProvider ?? null, modelId: bot.modelId ?? null })), claimableProfiles, allowedActions: { add: managers.has(context.project.role), adopt: managers.has(context.project.role), retry: managers.has(context.project.role) && retained.length > 0, chat: operators.has(context.project.role) }, provenance: "SIGNED_PROJECT_BINDING" as const };
  } catch (error) {
    return { ...common, state: "ADAPTER_UNAVAILABLE" as const, failureCode: safeFailure(error), inventory: [], claimableProfiles: [], allowedActions: { add: false, adopt: false, retry: managers.has(context.project.role) && retained.length > 0, chat: operators.has(context.project.role) }, provenance: "RETAINED_ROGEROS_ASSIGNMENTS" as const };
  }
}
