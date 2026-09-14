import { createHash } from "node:crypto";
import { AuditActorType, Prisma, ProjectRole } from "@prisma/client";

import { recordAuditEvent } from "@/lib/audit";
import { isProvisionableHermesSkillId } from "@/lib/hermes-bots";
import {
  employeeStudioAdapter,
  employeeStudioAdapterConfigured,
  isAllowedProfileFileKey,
  type EmployeeStudioAdapter,
  type StudioBinding,
  type StudioCapabilities,
  type StudioModelCatalog,
  type StudioMutationReceipt,
  type StudioProfileFile,
} from "@/lib/employee-studio-adapter";
import type { ProjectContext } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";

const managers = new Set<ProjectRole>(["OWNER", "ADMIN"]);
const idempotencyKey = /^[A-Za-z0-9._:-]{8,200}$/;
const modelPart = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,239}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const mcpKey = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const editableFileKeys = new Set(["identity", "preferences", "instructions", "memory"]);
const maxProfileFileBytes = 65_536;

type LoadedAssignment = Awaited<ReturnType<typeof loadAssignment>>;

export class EmployeeStudioError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "EmployeeStudioError";
  }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeFailure(error: unknown) {
  if (error instanceof EmployeeStudioError) return error.code;
  if (error instanceof Error && /^EMPLOYEE_STUDIO_[A-Z0-9_]{1,160}$/.test(error.message)) return error.message;
  return "EMPLOYEE_STUDIO_OPERATION_FAILED";
}

function assertManager(context: ProjectContext) {
  if (!managers.has(context.project.role)) throw new EmployeeStudioError("FORBIDDEN");
}

async function actor(context: ProjectContext) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId: context.project.id, organizationMember: { userId: context.user.id } },
    select: { id: true },
  });
  if (!member) throw new EmployeeStudioError("FORBIDDEN");
  return member;
}

async function loadAssignment(context: ProjectContext, employeeProjectAssignmentId: string) {
  const employeeAssignment = await prisma.employeeProjectAssignment.findFirst({
    where: { id: employeeProjectAssignmentId, projectId: context.project.id },
    include: {
      employee: { select: { name: true, role: true, description: true } },
      runtimeAssignments: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 },
      skillAssignments: { where: { state: "ACTIVE" }, include: { skill: true }, orderBy: { skill: { name: "asc" } } },
    },
  });
  if (!employeeAssignment) throw new EmployeeStudioError("EMPLOYEE_ASSIGNMENT_NOT_FOUND");
  const runtimeAssignment = employeeAssignment.runtimeAssignments[0];
  if (!runtimeAssignment) throw new EmployeeStudioError("RUNTIME_ASSIGNMENT_NOT_FOUND");
  if (runtimeAssignment.assignmentState === "RETIRED") throw new EmployeeStudioError("RUNTIME_RETIRED");
  return { employeeAssignment, runtimeAssignment };
}

function bindingFor(context: ProjectContext, loaded: LoadedAssignment, actorId: string): StudioBinding {
  return {
    projectId: context.project.id,
    runtimeId: loaded.runtimeAssignment.runtimeId,
    runtimeAssignmentId: loaded.runtimeAssignment.id,
    profileId: loaded.runtimeAssignment.profileKey,
    actorId,
  };
}

function unavailableCapabilities(reason: "SETUP_REQUIRED" | "UNAVAILABLE"): StudioCapabilities {
  const state = { available: false, reason } as const;
  return {
    contractVersion: "employee-studio-v1",
    binding: { projectId: "unavailable", runtimeId: "unavailable", runtimeAssignmentId: "unavailable", profileId: "unavailable", actorId: "unavailable" },
    model: state,
    profileFiles: state,
    skills: state,
    skillLifecycle: state,
    mcp: state,
    observedAt: new Date().toISOString(),
  };
}

async function capabilitiesFor(binding: StudioBinding, adapter: EmployeeStudioAdapter) {
  if (!employeeStudioAdapterConfigured() && adapter === employeeStudioAdapter)
    return unavailableCapabilities("SETUP_REQUIRED");
  try {
    return await adapter.capabilities(binding);
  } catch {
    return unavailableCapabilities("UNAVAILABLE");
  }
}

async function requireCapability(
  binding: StudioBinding,
  key: "model" | "profileFiles" | "skills" | "skillLifecycle" | "mcp",
  adapter: EmployeeStudioAdapter,
) {
  if (!employeeStudioAdapterConfigured() && adapter === employeeStudioAdapter)
    throw new EmployeeStudioError("EMPLOYEE_STUDIO_SETUP_REQUIRED");
  let capabilities: StudioCapabilities;
  try {
    capabilities = await adapter.capabilities(binding);
  } catch {
    throw new EmployeeStudioError("EMPLOYEE_STUDIO_CAPABILITY_UNAVAILABLE");
  }
  if (!capabilities[key].available) {
    throw new EmployeeStudioError(capabilities[key].reason === "SETUP_REQUIRED" ? "EMPLOYEE_STUDIO_SETUP_REQUIRED" : "EMPLOYEE_STUDIO_CAPABILITY_UNAVAILABLE");
  }
  return capabilities;
}

async function claimMutation(input: {
  context: ProjectContext;
  actorId: string;
  runtimeAssignmentId: string;
  idempotencyKey: string;
  operation: string;
  requestMetadata: Record<string, unknown>;
}) {
  if (!idempotencyKey.test(input.idempotencyKey)) throw new EmployeeStudioError("IDEMPOTENCY_KEY_REQUIRED");
  const requestFingerprint = fingerprint({ operation: input.operation, ...input.requestMetadata });
  const unique = { projectId_idempotencyKey: { projectId: input.context.project.id, idempotencyKey: input.idempotencyKey } };
  const existing = await prisma.runtimeConfigurationMutation.findUnique({ where: unique });
  if (existing) {
    if (existing.operation !== input.operation || existing.requestFingerprint !== requestFingerprint)
      throw new EmployeeStudioError("IDEMPOTENCY_KEY_REUSED");
    return { mutation: existing, replay: true };
  }
  try {
    const mutation = await prisma.runtimeConfigurationMutation.create({
      data: {
        projectId: input.context.project.id,
        runtimeAssignmentId: input.runtimeAssignmentId,
        actorProjectMemberId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        operation: input.operation,
        requestFingerprint,
        requestMetadata: input.requestMetadata as Prisma.InputJsonValue,
      },
    });
    return { mutation, replay: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await prisma.runtimeConfigurationMutation.findUniqueOrThrow({ where: unique });
    if (raced.operation !== input.operation || raced.requestFingerprint !== requestFingerprint)
      throw new EmployeeStudioError("IDEMPOTENCY_KEY_REUSED");
    return { mutation: raced, replay: true };
  }
}

function replayResult(mutation: { status: string; resultMetadata: unknown; errorCode: string | null }) {
  if (mutation.status === "SUCCEEDED") return { replay: true, mutation };
  if (mutation.status === "PENDING") throw new EmployeeStudioError("MUTATION_IN_PROGRESS");
  throw new EmployeeStudioError(mutation.errorCode || "MUTATION_PREVIOUSLY_FAILED");
}

async function auditMutation(context: ProjectContext, actorId: string, eventType: string, mutationId: string, summary: string, metadata: Record<string, unknown>) {
  return recordAuditEvent({
    projectId: context.project.id,
    eventType,
    actor: { type: AuditActorType.HUMAN, projectMemberId: actorId },
    targetType: "RuntimeConfigurationMutation",
    targetId: mutationId,
    summary,
    metadata,
  });
}

function modelFromReceipt(receipt: StudioMutationReceipt) {
  const provider = receipt.observed.provider;
  const modelId = receipt.observed.modelId;
  if (typeof provider !== "string" || typeof modelId !== "string" || !modelPart.test(provider) || !modelPart.test(modelId))
    throw new EmployeeStudioError("EMPLOYEE_STUDIO_MALFORMED_MODEL_RECEIPT");
  return { provider, modelId };
}

export async function readEmployeeStudio(
  context: ProjectContext,
  employeeProjectAssignmentId: string,
  adapter: EmployeeStudioAdapter = employeeStudioAdapter,
) {
  const [loaded, member] = await Promise.all([
    loadAssignment(context, employeeProjectAssignmentId),
    actor(context),
  ]);
  const binding = bindingFor(context, loaded, member.id);
  const capabilities = await capabilitiesFor(binding, adapter);
  let modelCatalog: StudioModelCatalog | null = null;
  let profileFiles: Awaited<ReturnType<EmployeeStudioAdapter["listProfileFiles"]>> = [];
  let observedSkills: Awaited<ReturnType<EmployeeStudioAdapter["listSkills"]>> = [];
  let mcpCatalog: Awaited<ReturnType<EmployeeStudioAdapter["listMcpServers"]>> = [];
  await Promise.all([
    capabilities.model.available ? adapter.modelCatalog(binding).then((value) => { modelCatalog = value; }).catch(() => undefined) : Promise.resolve(),
    capabilities.profileFiles.available ? adapter.listProfileFiles(binding).then((value) => { profileFiles = value; }).catch(() => undefined) : Promise.resolve(),
    capabilities.skills.available ? adapter.listSkills(binding).then((value) => { observedSkills = value; }).catch(() => undefined) : Promise.resolve(),
    capabilities.mcp.available ? adapter.listMcpServers(binding).then((value) => { mcpCatalog = value; }).catch(() => undefined) : Promise.resolve(),
  ]);
  const mcpAssignments = await prisma.governedMcpAssignment.findMany({
    where: { projectId: context.project.id, runtimeAssignmentId: loaded.runtimeAssignment.id },
    include: { projectConnection: { select: { name: true, status: true, enabled: true } }, tools: { orderBy: { toolKey: "asc" } } },
    orderBy: { serverKey: "asc" },
  });
  const eligibleConnections = await prisma.projectConnection.findMany({
    where: { projectId: context.project.id, enabled: true, status: "CONNECTED", credential: { status: "ACTIVE" }, projectTool: { status: "CONNECTED", appInstallations: { some: { status: "CONNECTED" } } } },
    select: { id: true, name: true, projectTool: { select: { displayName: true, tool: { select: { key: true, name: true } } } } },
    orderBy: { name: "asc" },
  });
  const skillCatalog = await prisma.skill.findMany({
    where: { trustStatus: "TRUSTED", isEnabled: true },
    select: { id: true, slug: true, name: true, description: true, category: true, version: true, sourceIdentifier: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return {
    overview: {
      employeeProjectAssignmentId: loaded.employeeAssignment.id,
      name: loaded.employeeAssignment.employee.name,
      role: loaded.employeeAssignment.roleOverride || loaded.employeeAssignment.employee.role,
      description: loaded.employeeAssignment.employee.description,
      avatarPresetKey: loaded.employeeAssignment.avatarPresetKey,
      avatarAssetId: loaded.employeeAssignment.avatarAssetId,
      profileId: loaded.runtimeAssignment.profileKey,
      assignmentState: loaded.runtimeAssignment.assignmentState,
      provisioningState: loaded.runtimeAssignment.provisioningState,
      reconciliationState: loaded.runtimeAssignment.reconciliationState,
      runtimeStatus: loaded.runtimeAssignment.runtimeStatus,
      lastReconciledAt: loaded.runtimeAssignment.lastReconciledAt,
      studioConfigRevision: loaded.runtimeAssignment.studioConfigRevision,
      desiredModelProvider: loaded.runtimeAssignment.desiredModelProvider,
      desiredModelId: loaded.runtimeAssignment.desiredModelId,
      observedModelProvider: loaded.runtimeAssignment.observedModelProvider,
      observedModelId: loaded.runtimeAssignment.observedModelId,
    },
    capabilities: {
      model: capabilities.model,
      profileFiles: capabilities.profileFiles,
      skills: capabilities.skills,
      skillLifecycle: capabilities.skillLifecycle,
      mcp: capabilities.mcp,
      observedAt: capabilities.observedAt,
    },
    modelCatalog,
    profileFiles,
    skills: loaded.employeeAssignment.skillAssignments.map((assignment) => ({
      id: assignment.id,
      state: assignment.state,
      desiredVersion: assignment.desiredVersion,
      reconciliationStatus: assignment.reconciliationStatus,
      reconciliationError: assignment.reconciliationError,
      skill: { id: assignment.skill.id, slug: assignment.skill.slug, name: assignment.skill.name, description: assignment.skill.description, category: assignment.skill.category, version: assignment.skill.version },
      observed: observedSkills.find((skill) => skill.key === assignment.skill.sourceIdentifier) || null,
    })),
    skillCatalog: skillCatalog.map(({ sourceIdentifier, ...skill }) => ({ ...skill, runtimeKey: sourceIdentifier })),
    observedSkills,
    mcp: {
      catalog: mcpCatalog,
      eligibleConnections,
      assignments: mcpAssignments.map((assignment) => ({
        id: assignment.id,
        serverKey: assignment.serverKey,
        state: assignment.state,
        revision: assignment.revision,
        observedFingerprint: assignment.observedFingerprint,
        lastObservedAt: assignment.lastObservedAt,
        lastErrorCode: assignment.lastErrorCode,
        connection: assignment.projectConnection,
        tools: assignment.tools.map((tool) => ({ toolKey: tool.toolKey, enabled: tool.enabled })),
        secretConfigured: true,
      })),
    },
    canManage: managers.has(context.project.role),
  };
}

export async function reconcileEmployeeStudioSkill(
  context: ProjectContext,
  input: { employeeProjectAssignmentId: string; skillId: string; expectedVersion: string; enabled: boolean; idempotencyKey: string },
  adapter: EmployeeStudioAdapter = employeeStudioAdapter,
) {
  assertManager(context);
  const [loaded, member, skill] = await Promise.all([
    loadAssignment(context, input.employeeProjectAssignmentId),
    actor(context),
    prisma.skill.findFirst({ where: { id: input.skillId, trustStatus: "TRUSTED", isEnabled: true, sourceType: "SYSTEM", version: input.expectedVersion } }),
  ]);
  if (loaded.runtimeAssignment.assignmentState !== "ACTIVE") throw new EmployeeStudioError("RUNTIME_SUSPENDED");
  if (!skill || !mcpKey.test(skill.sourceIdentifier) || !isProvisionableHermesSkillId(skill.sourceIdentifier)) throw new EmployeeStudioError("SKILL_NOT_AVAILABLE");
  const binding = bindingFor(context, loaded, member.id);
  await requireCapability(binding, "skillLifecycle", adapter);
  const observed = await adapter.listSkills(binding);
  const runtimeSkill = observed.find((item) => item.key === skill.sourceIdentifier);
  if (input.enabled && (!runtimeSkill || runtimeSkill.version !== skill.version)) throw new EmployeeStudioError("SKILL_VERSION_UNAVAILABLE");
  const existing = await prisma.employeeSkillAssignment.findUnique({ where: { employeeProjectAssignmentId_skillId: { employeeProjectAssignmentId: loaded.employeeAssignment.id, skillId: skill.id } } });
  const previousEnabled = existing?.state === "ACTIVE";
  const requestMetadata = { skillId: skill.id, skillKey: skill.sourceIdentifier, version: skill.version, enabled: input.enabled };
  const claimed = await claimMutation({ context, actorId: member.id, runtimeAssignmentId: loaded.runtimeAssignment.id, idempotencyKey: input.idempotencyKey, operation: "SKILL_RECONCILE", requestMetadata });
  if (claimed.replay) return replayResult(claimed.mutation);
  let receipt: StudioMutationReceipt | null = null;
  try {
    receipt = await adapter.reconcileSkill({ binding, mutationId: claimed.mutation.id, skillKey: skill.sourceIdentifier, version: skill.version, enabled: input.enabled });
    if (receipt.status !== "APPLIED") throw new EmployeeStudioError("SKILL_RECONCILIATION_MISMATCH");
    if (receipt.observed.skillKey !== skill.sourceIdentifier || receipt.observed.skillVersion !== skill.version || receipt.observed.enabled !== input.enabled) throw new EmployeeStudioError("SKILL_RECONCILIATION_MISMATCH");
    const assignment = await prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.employeeSkillAssignment.update({ where: { id: existing.id }, data: { state: input.enabled ? "ACTIVE" : "REMOVED", desiredVersion: skill.version, assignedByUserId: context.user.id, assignedAt: input.enabled ? new Date() : existing.assignedAt, removedAt: input.enabled ? null : new Date(), lastReconciledAt: new Date(receipt!.completedAt), reconciliationStatus: "IN_SYNC", reconciliationError: null } })
        : await tx.employeeSkillAssignment.create({ data: { projectId: context.project.id, employeeProjectAssignmentId: loaded.employeeAssignment.id, skillId: skill.id, state: input.enabled ? "ACTIVE" : "REMOVED", assignedByUserId: context.user.id, desiredVersion: skill.version, removedAt: input.enabled ? null : new Date(), lastReconciledAt: new Date(receipt!.completedAt), reconciliationStatus: "IN_SYNC" } });
      await tx.hermesRuntimeAssignment.update({ where: { id: loaded.runtimeAssignment.id }, data: { desiredSkillRevision: { increment: 1 }, studioConfigRevision: { increment: 1 }, reconciliationState: "IN_SYNC", lastReconciledAt: new Date(receipt!.completedAt), lastReconcileError: null } });
      await tx.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "SUCCEEDED", adapterReceiptId: receipt!.receiptId, resultMetadata: { skillId: skill.id, skillKey: skill.sourceIdentifier, version: skill.version, enabled: input.enabled }, completedAt: new Date(receipt!.completedAt) } });
      return saved;
    });
    await auditMutation(context, member.id, "runtime.studio.skill.reconciled", claimed.mutation.id, "Employee skill reconciled", { skillId: skill.id, skillKey: skill.sourceIdentifier, version: skill.version, enabled: input.enabled, receiptId: receipt.receiptId });
    return { replay: false, assignment };
  } catch (error) {
    const code = safeFailure(error);
    if (receipt) {
      try {
        const rollback = await adapter.rollbackSkill({ binding, mutationId: claimed.mutation.id, receiptId: receipt.receiptId, skillKey: skill.sourceIdentifier, version: skill.version, enabled: previousEnabled });
        if (rollback.status !== "ROLLED_BACK" || rollback.observed.enabled !== previousEnabled) throw new EmployeeStudioError("SKILL_ROLLBACK_MISMATCH");
        await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ROLLED_BACK", adapterReceiptId: rollback.receiptId, errorCode: code, completedAt: new Date(rollback.completedAt) } });
      } catch {
        await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ATTENTION", errorCode: "SKILL_ROLLBACK_FAILED", completedAt: new Date() } });
        throw new EmployeeStudioError("SKILL_ROLLBACK_FAILED");
      }
    } else await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "FAILED", errorCode: code, completedAt: new Date() } });
    throw error;
  }
}

export async function changeEmployeeStudioModel(
  context: ProjectContext,
  input: { employeeProjectAssignmentId: string; provider: string; modelId: string; catalogRevision: string; expectedRevision: number; idempotencyKey: string },
  adapter: EmployeeStudioAdapter = employeeStudioAdapter,
) {
  assertManager(context);
  if (!modelPart.test(input.provider) || !modelPart.test(input.modelId) || !input.catalogRevision || input.catalogRevision.length > 160 || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)
    throw new EmployeeStudioError("INVALID_MODEL_SELECTION");
  const [loaded, member] = await Promise.all([loadAssignment(context, input.employeeProjectAssignmentId), actor(context)]);
  if (loaded.runtimeAssignment.assignmentState !== "ACTIVE") throw new EmployeeStudioError("RUNTIME_SUSPENDED");
  if (loaded.runtimeAssignment.studioConfigRevision !== input.expectedRevision) throw new EmployeeStudioError("STALE_CONFIGURATION");
  const binding = bindingFor(context, loaded, member.id);
  await requireCapability(binding, "model", adapter);
  const catalog = await adapter.modelCatalog(binding);
  if (catalog.revision !== input.catalogRevision || Date.parse(catalog.expiresAt) <= Date.now()) throw new EmployeeStudioError("STALE_MODEL_CATALOG");
  const selected = catalog.models.find((model) => model.provider === input.provider && model.modelId === input.modelId);
  if (!selected) throw new EmployeeStudioError("MODEL_NOT_APPROVED");
  if (selected.setupState !== "READY") throw new EmployeeStudioError(selected.setupState === "SETUP_REQUIRED" ? "MODEL_SETUP_REQUIRED" : "MODEL_UNAVAILABLE");
  if (!catalog.current) throw new EmployeeStudioError("MODEL_CURRENT_STATE_UNAVAILABLE");
  const requestMetadata = { provider: input.provider, modelId: input.modelId, catalogRevision: input.catalogRevision, expectedRevision: input.expectedRevision, previousProvider: catalog.current.provider, previousModelId: catalog.current.modelId };
  const claimed = await claimMutation({ context, actorId: member.id, runtimeAssignmentId: loaded.runtimeAssignment.id, idempotencyKey: input.idempotencyKey, operation: "MODEL_CHANGE", requestMetadata });
  if (claimed.replay) return replayResult(claimed.mutation);
  await auditMutation(context, member.id, "runtime.studio.model.requested", claimed.mutation.id, "Employee model change requested", requestMetadata);
  let receipt: StudioMutationReceipt | null = null;
  try {
    receipt = await adapter.changeModel({ binding, mutationId: claimed.mutation.id, catalogRevision: catalog.revision, expectedRevision: catalog.current.revision, expectedFingerprint: catalog.current.fingerprint, provider: input.provider, modelId: input.modelId, observedModelId: catalog.current.modelId });
    if (receipt.status !== "APPLIED") throw new EmployeeStudioError("MODEL_RECONCILIATION_MISMATCH");
    const observed = modelFromReceipt(receipt);
    if (observed.provider !== input.provider || observed.modelId !== input.modelId) throw new EmployeeStudioError("MODEL_RECONCILIATION_MISMATCH");
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.hermesRuntimeAssignment.updateMany({
        where: { id: loaded.runtimeAssignment.id, projectId: context.project.id, studioConfigRevision: input.expectedRevision },
        data: { desiredModelProvider: input.provider, desiredModelId: input.modelId, observedModelProvider: observed.provider, observedModelId: observed.modelId, observedConfigFingerprint: receipt!.observedFingerprint, modelCatalogRevision: catalog.revision, modelCatalogExpiresAt: new Date(catalog.expiresAt), studioConfigRevision: { increment: 1 }, reconciliationState: "IN_SYNC", lastReconcileError: null, lastReconciledAt: new Date(receipt!.completedAt) },
      });
      if (saved.count !== 1) throw new EmployeeStudioError("STALE_CONFIGURATION");
      return tx.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "SUCCEEDED", adapterReceiptId: receipt!.receiptId, resultMetadata: { provider: observed.provider, modelId: observed.modelId, observedFingerprint: receipt!.observedFingerprint, revision: input.expectedRevision + 1 }, completedAt: new Date(receipt!.completedAt) } });
    });
    await auditMutation(context, member.id, "runtime.studio.model.succeeded", claimed.mutation.id, "Employee model change reconciled", { provider: input.provider, modelId: input.modelId, revision: input.expectedRevision + 1, receiptId: receipt.receiptId });
    return { replay: false, mutation: updated };
  } catch (error) {
    const code = safeFailure(error);
    if (receipt) {
      try {
        const rollback = await adapter.rollbackModel({ binding, mutationId: claimed.mutation.id, receiptId: receipt.receiptId, expectedRevision: Number(receipt.observed.revision), provider: catalog.current.provider, modelId: catalog.current.modelId, observedModelId: input.modelId });
        const rolledBack = modelFromReceipt(rollback);
        if (rollback.status !== "ROLLED_BACK" || rolledBack.provider !== catalog.current.provider || rolledBack.modelId !== catalog.current.modelId)
          throw new EmployeeStudioError("MODEL_ROLLBACK_MISMATCH");
        await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ROLLED_BACK", adapterReceiptId: rollback.receiptId, errorCode: code, resultMetadata: { provider: rolledBack.provider, modelId: rolledBack.modelId, observedFingerprint: rollback.observedFingerprint }, completedAt: new Date(rollback.completedAt) } });
        await auditMutation(context, member.id, "runtime.studio.model.rolled_back", claimed.mutation.id, "Employee model change rolled back", { errorCode: code, receiptId: rollback.receiptId });
      } catch {
        await prisma.$transaction([
          prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ATTENTION", errorCode: "MODEL_ROLLBACK_FAILED", completedAt: new Date() } }),
          prisma.hermesRuntimeAssignment.update({ where: { id: loaded.runtimeAssignment.id }, data: { reconciliationState: "FAILED", lastReconcileError: "MODEL_ROLLBACK_FAILED" } }),
        ]);
        await auditMutation(context, member.id, "runtime.studio.model.attention", claimed.mutation.id, "Employee model rollback needs attention", { errorCode: "MODEL_ROLLBACK_FAILED" });
        throw new EmployeeStudioError("MODEL_ROLLBACK_FAILED");
      }
    } else {
      await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "FAILED", errorCode: code, completedAt: new Date() } });
      await auditMutation(context, member.id, "runtime.studio.model.failed", claimed.mutation.id, "Employee model change failed safely", { errorCode: code });
    }
    throw error;
  }
}

function containsSecretValue(content: string) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{20,}\b|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?[^\s"']{8,}/i.test(content);
}

function validateProfileContent(logicalKey: string, content: string) {
  if (!isAllowedProfileFileKey(logicalKey) || !editableFileKeys.has(logicalKey)) throw new EmployeeStudioError("PROFILE_FILE_NOT_EDITABLE");
  const bytes = Buffer.byteLength(content, "utf8");
  if (!content || content.includes("\0") || bytes > maxProfileFileBytes) throw new EmployeeStudioError("INVALID_PROFILE_FILE_CONTENT");
  if (containsSecretValue(content)) throw new EmployeeStudioError("PROFILE_FILE_SECRET_DENIED");
  return { bytes, digest: createHash("sha256").update(content).digest("hex") };
}

async function persistObservedFile(context: ProjectContext, runtimeAssignmentId: string, file: StudioProfileFile, actorId?: string, receiptId?: string) {
  if (containsSecretValue(file.content)) throw new EmployeeStudioError("PROFILE_FILE_SECRET_DENIED");
  const existing = await prisma.studioProfileFile.findUnique({ where: { projectId_runtimeAssignmentId_logicalKey: { projectId: context.project.id, runtimeAssignmentId, logicalKey: file.logicalKey } } });
  if (existing?.currentDigest === file.digest) return existing;
  if (!existing) {
    return prisma.studioProfileFile.create({ data: { projectId: context.project.id, runtimeAssignmentId, logicalKey: file.logicalKey, currentVersion: 1, currentSourceRevision: file.version, currentDigest: file.digest, observedAt: new Date(), versions: { create: { version: 1, sourceRevision: file.version, digest: file.digest, byteLength: file.byteLength, content: file.content, adapterReceiptId: receiptId, createdByProjectMemberId: actorId } } } });
  }
  return prisma.$transaction(async (tx) => {
    const version = existing.currentVersion + 1;
    await tx.studioProfileFileVersion.create({ data: { projectId: context.project.id, profileFileId: existing.id, version, sourceRevision: file.version, digest: file.digest, byteLength: file.byteLength, content: file.content, adapterReceiptId: receiptId, createdByProjectMemberId: actorId } });
    return tx.studioProfileFile.update({ where: { id: existing.id }, data: { currentVersion: version, currentSourceRevision: file.version, currentDigest: file.digest, observedAt: new Date(), state: "READY" } });
  });
}

export async function readEmployeeStudioProfileFile(context: ProjectContext, employeeProjectAssignmentId: string, logicalKey: string, adapter: EmployeeStudioAdapter = employeeStudioAdapter) {
  if (!isAllowedProfileFileKey(logicalKey)) throw new EmployeeStudioError("PROFILE_FILE_NOT_ALLOWED");
  const [loaded, member] = await Promise.all([
    loadAssignment(context, employeeProjectAssignmentId),
    actor(context),
  ]);
  if (logicalKey.startsWith("skills/")) {
    const runtimeKey = logicalKey.slice("skills/".length, -"/SKILL.md".length);
    if (!loaded.employeeAssignment.skillAssignments.some((assignment) => assignment.skill.sourceIdentifier === runtimeKey)) throw new EmployeeStudioError("PROFILE_FILE_NOT_ALLOWED");
  }
  const binding = bindingFor(context, loaded, member.id);
  await requireCapability(binding, "profileFiles", adapter);
  const file = await adapter.readProfileFile(binding, logicalKey);
  await persistObservedFile(context, loaded.runtimeAssignment.id, file);
  const versions = await prisma.studioProfileFileVersion.findMany({ where: { projectId: context.project.id, profileFile: { runtimeAssignmentId: loaded.runtimeAssignment.id, logicalKey } }, select: { id: true, version: true, digest: true, byteLength: true, createdAt: true }, orderBy: { version: "desc" }, take: 20 });
  return { file, versions };
}

export async function writeEmployeeStudioProfileFile(
  context: ProjectContext,
  input: { employeeProjectAssignmentId: string; logicalKey: string; expectedDigest: string; content?: string; restoreVersion?: number; idempotencyKey: string },
  adapter: EmployeeStudioAdapter = employeeStudioAdapter,
) {
  assertManager(context);
  if (!digestPattern.test(input.expectedDigest)) throw new EmployeeStudioError("INVALID_PROFILE_FILE_DIGEST");
  const [loaded, member] = await Promise.all([loadAssignment(context, input.employeeProjectAssignmentId), actor(context)]);
  if (loaded.runtimeAssignment.assignmentState !== "ACTIVE") throw new EmployeeStudioError("RUNTIME_SUSPENDED");
  const binding = bindingFor(context, loaded, member.id);
  await requireCapability(binding, "profileFiles", adapter);
  const current = await adapter.readProfileFile(binding, input.logicalKey);
  if (current.digest !== input.expectedDigest) throw new EmployeeStudioError("STALE_PROFILE_FILE");
  let content = input.content;
  let operation = "PROFILE_FILE_WRITE";
  let restoreSourceRevision: number | null = null;
  if (input.restoreVersion !== undefined) {
    if (!Number.isInteger(input.restoreVersion) || input.restoreVersion < 1) throw new EmployeeStudioError("INVALID_PROFILE_FILE_VERSION");
    const stored = await prisma.studioProfileFileVersion.findFirst({ where: { projectId: context.project.id, version: input.restoreVersion, profileFile: { runtimeAssignmentId: loaded.runtimeAssignment.id, logicalKey: input.logicalKey } } });
    if (!stored) throw new EmployeeStudioError("PROFILE_FILE_VERSION_NOT_FOUND");
    content = stored.content;
    restoreSourceRevision = stored.sourceRevision;
    operation = "PROFILE_FILE_RESTORE";
  }
  if (typeof content !== "string") throw new EmployeeStudioError("INVALID_PROFILE_FILE_CONTENT");
  const next = validateProfileContent(input.logicalKey, content);
  const requestMetadata = { logicalKey: input.logicalKey, expectedDigest: input.expectedDigest, nextDigest: next.digest, byteLength: next.bytes, restoreVersion: input.restoreVersion ?? null };
  const claimed = await claimMutation({ context, actorId: member.id, runtimeAssignmentId: loaded.runtimeAssignment.id, idempotencyKey: input.idempotencyKey, operation, requestMetadata });
  if (claimed.replay) return replayResult(claimed.mutation);
  let receipt: StudioMutationReceipt | null = null;
  try {
    receipt = input.restoreVersion === undefined
      ? await adapter.writeProfileFile({ binding, mutationId: claimed.mutation.id, logicalKey: input.logicalKey, expectedVersion: current.version, expectedDigest: input.expectedDigest, content })
      : await adapter.restoreProfileFile({ binding, mutationId: claimed.mutation.id, logicalKey: input.logicalKey, expectedVersion: current.version, expectedDigest: input.expectedDigest, restoreVersion: restoreSourceRevision! });
    if (receipt.status !== "APPLIED") throw new EmployeeStudioError("PROFILE_FILE_RECONCILIATION_MISMATCH");
    const observedKey = receipt.observed.logicalKey;
    const observedDigest = receipt.observed.digest;
    const observedVersion = receipt.observed.version;
    if (observedKey !== input.logicalKey || observedDigest !== next.digest || !Number.isInteger(observedVersion)) throw new EmployeeStudioError("PROFILE_FILE_RECONCILIATION_MISMATCH");
    const observed: StudioProfileFile = { logicalKey: input.logicalKey, displayName: current.displayName, editable: true, version: Number(observedVersion), digest: next.digest, byteLength: next.bytes, content };
    const savedFile = await persistObservedFile(context, loaded.runtimeAssignment.id, observed, member.id, receipt.receiptId);
    const mutation = await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "SUCCEEDED", adapterReceiptId: receipt.receiptId, resultMetadata: { logicalKey: input.logicalKey, digest: next.digest, version: savedFile.currentVersion }, completedAt: new Date(receipt.completedAt) } });
    await auditMutation(context, member.id, `runtime.studio.file.${operation === "PROFILE_FILE_RESTORE" ? "restored" : "updated"}`, mutation.id, `Employee profile file ${operation === "PROFILE_FILE_RESTORE" ? "restored" : "updated"}`, { logicalKey: input.logicalKey, digest: next.digest, version: savedFile.currentVersion, receiptId: receipt.receiptId });
    return { replay: false, mutation };
  } catch (error) {
    const code = safeFailure(error);
    if (receipt) {
      try {
        const rollback = await adapter.restoreProfileFile({ binding, mutationId: claimed.mutation.id, logicalKey: input.logicalKey, expectedVersion: Number(receipt.observed.version), expectedDigest: next.digest, restoreVersion: current.version });
        if (rollback.observed.digest !== current.digest) throw new EmployeeStudioError("PROFILE_FILE_ROLLBACK_MISMATCH");
        await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ROLLED_BACK", adapterReceiptId: rollback.receiptId, errorCode: code, completedAt: new Date(rollback.completedAt) } });
      } catch {
        await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ATTENTION", errorCode: "PROFILE_FILE_ROLLBACK_FAILED", completedAt: new Date() } });
        throw new EmployeeStudioError("PROFILE_FILE_ROLLBACK_FAILED");
      }
    } else {
      await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "FAILED", errorCode: code, completedAt: new Date() } });
    }
    throw error;
  }
}

export async function reconcileEmployeeStudioMcp(
  context: ProjectContext,
  input: { employeeProjectAssignmentId: string; serverKey: string; projectConnectionId: string; enabled: boolean; toolKeys: string[]; expectedRevision: number; idempotencyKey: string },
  adapter: EmployeeStudioAdapter = employeeStudioAdapter,
) {
  assertManager(context);
  if (!mcpKey.test(input.serverKey) || !Array.isArray(input.toolKeys) || input.toolKeys.length > 100 || input.toolKeys.some((key) => !mcpKey.test(key)) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)
    throw new EmployeeStudioError("INVALID_MCP_CONFIGURATION");
  const [loaded, member] = await Promise.all([loadAssignment(context, input.employeeProjectAssignmentId), actor(context)]);
  const binding = bindingFor(context, loaded, member.id);
  await requireCapability(binding, "mcp", adapter);
  const catalog = await adapter.listMcpServers(binding);
  const server = catalog.find((entry) => entry.serverKey === input.serverKey);
  if (!server || server.setupState === "UNAVAILABLE") throw new EmployeeStudioError("MCP_SERVER_UNAVAILABLE");
  if (server.setupState === "SETUP_REQUIRED") throw new EmployeeStudioError("MCP_SETUP_REQUIRED");
  const toolKeys = [...new Set(input.toolKeys)].sort();
  if (toolKeys.some((key) => !server.toolKeys.includes(key))) throw new EmployeeStudioError("MCP_TOOL_NOT_APPROVED");
  const connection = await prisma.projectConnection.findFirst({
    where: { id: input.projectConnectionId, projectId: context.project.id },
    include: { credential: true, projectTool: { include: { appInstallations: true } } },
  });
  if (!connection || !connection.enabled || connection.status !== "CONNECTED" || connection.projectTool.status !== "CONNECTED" || !connection.credential || connection.credential.status !== "ACTIVE" || !connection.projectTool.appInstallations.some((installation) => installation.status === "CONNECTED"))
    throw new EmployeeStudioError("MCP_CONNECTION_NOT_READY");
  const permissions = await prisma.employeeToolPermission.findMany({ where: { projectId: context.project.id, employeeProjectAssignmentId: loaded.employeeAssignment.id, projectToolId: connection.projectToolId, level: "FULL_EXECUTE", capabilityKey: { in: ["*", ...toolKeys] } }, select: { capabilityKey: true } });
  const permitted = new Set(permissions.map((permission) => permission.capabilityKey));
  if (input.enabled && toolKeys.some((key) => !permitted.has("*") && !permitted.has(key))) throw new EmployeeStudioError("MCP_TOOL_PERMISSION_REQUIRED");
  const previous = await prisma.governedMcpAssignment.findUnique({ where: { projectId_runtimeAssignmentId_serverKey: { projectId: context.project.id, runtimeAssignmentId: loaded.runtimeAssignment.id, serverKey: input.serverKey } }, include: { tools: true } });
  if ((previous?.revision ?? 0) !== input.expectedRevision) throw new EmployeeStudioError("STALE_CONFIGURATION");
  const requestMetadata = { serverKey: input.serverKey, projectConnectionId: connection.id, enabled: input.enabled, toolKeys, expectedRevision: input.expectedRevision };
  const claimed = await claimMutation({ context, actorId: member.id, runtimeAssignmentId: loaded.runtimeAssignment.id, idempotencyKey: input.idempotencyKey, operation: "MCP_RECONCILE", requestMetadata });
  if (claimed.replay) return replayResult(claimed.mutation);
  let receipt: StudioMutationReceipt | null = null;
  try {
    receipt = await adapter.reconcileMcp({ binding, mutationId: claimed.mutation.id, serverKey: input.serverKey, enabled: input.enabled, secretReferenceId: connection.credential.id, toolKeys });
    if (receipt.status !== "APPLIED") throw new EmployeeStudioError("MCP_RECONCILIATION_MISMATCH");
    if (receipt.observed.serverKey !== input.serverKey || receipt.observed.enabled !== input.enabled) throw new EmployeeStudioError("MCP_RECONCILIATION_MISMATCH");
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.governedMcpAssignment.findUnique({ where: { projectId_runtimeAssignmentId_serverKey: { projectId: context.project.id, runtimeAssignmentId: loaded.runtimeAssignment.id, serverKey: input.serverKey } } });
      if ((current?.revision ?? 0) !== input.expectedRevision) throw new EmployeeStudioError("STALE_CONFIGURATION");
      const saved = await tx.governedMcpAssignment.upsert({
        where: { projectId_runtimeAssignmentId_serverKey: { projectId: context.project.id, runtimeAssignmentId: loaded.runtimeAssignment.id, serverKey: input.serverKey } },
        create: { projectId: context.project.id, runtimeAssignmentId: loaded.runtimeAssignment.id, projectConnectionId: connection.id, secretReferenceId: connection.credential!.id, serverKey: input.serverKey, state: input.enabled ? "ENABLED" : "DISABLED", observedFingerprint: receipt!.observedFingerprint, lastObservedAt: new Date(receipt!.completedAt), tools: { create: server.toolKeys.map((toolKey) => ({ projectId: context.project.id, toolKey, enabled: input.enabled && toolKeys.includes(toolKey) })) } },
        update: { projectConnectionId: connection.id, secretReferenceId: connection.credential!.id, state: input.enabled ? "ENABLED" : "DISABLED", revision: { increment: 1 }, observedFingerprint: receipt!.observedFingerprint, lastObservedAt: new Date(receipt!.completedAt), lastErrorCode: null },
      });
      await tx.governedMcpToolAssignment.deleteMany({ where: { projectId: context.project.id, mcpAssignmentId: saved.id } });
      if (server.toolKeys.length) await tx.governedMcpToolAssignment.createMany({ data: server.toolKeys.map((toolKey) => ({ projectId: context.project.id, mcpAssignmentId: saved.id, toolKey, enabled: input.enabled && toolKeys.includes(toolKey) })) });
      const mutation = await tx.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "SUCCEEDED", adapterReceiptId: receipt!.receiptId, resultMetadata: { serverKey: input.serverKey, enabled: input.enabled, toolCount: toolKeys.length, observedFingerprint: receipt!.observedFingerprint }, completedAt: new Date(receipt!.completedAt) } });
      return { saved, mutation };
    });
    await auditMutation(context, member.id, "runtime.studio.mcp.reconciled", claimed.mutation.id, "Governed MCP assignment reconciled", { serverKey: input.serverKey, enabled: input.enabled, toolCount: toolKeys.length, receiptId: receipt!.receiptId });
    return { replay: false, mutation: result.mutation, assignment: result.saved };
  } catch (error) {
    const code = safeFailure(error);
    if (receipt) {
      try {
        const previousTools = previous?.tools.filter((tool) => tool.enabled).map((tool) => tool.toolKey) ?? [];
        const rollback = await adapter.rollbackMcp({ binding, mutationId: claimed.mutation.id, receiptId: receipt.receiptId, serverKey: input.serverKey, enabled: previous?.state === "ENABLED", secretReferenceId: previous?.secretReferenceId ?? connection.credential.id, toolKeys: previousTools });
        if (rollback.status !== "ROLLED_BACK" || rollback.observed.serverKey !== input.serverKey) throw new EmployeeStudioError("MCP_ROLLBACK_MISMATCH");
        await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ROLLED_BACK", adapterReceiptId: rollback.receiptId, errorCode: code, completedAt: new Date(rollback.completedAt) } });
      } catch {
        await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "ATTENTION", errorCode: "MCP_ROLLBACK_FAILED", completedAt: new Date() } });
        throw new EmployeeStudioError("MCP_ROLLBACK_FAILED");
      }
    } else await prisma.runtimeConfigurationMutation.update({ where: { id: claimed.mutation.id }, data: { status: "FAILED", errorCode: code, completedAt: new Date() } });
    await auditMutation(context, member.id, "runtime.studio.mcp.failed", claimed.mutation.id, "Governed MCP reconciliation failed safely", { serverKey: input.serverKey, errorCode: code });
    throw error;
  }
}
