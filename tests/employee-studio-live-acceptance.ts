import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  employeeStudioAdapter,
  verifyStudioDefaultDeny,
  type StudioBinding,
  type StudioMutationReceipt,
  type StudioProfileFile,
} from "../src/lib/employee-studio-adapter";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

process.env.ROGEROS_EMPLOYEE_STUDIO_ENABLED = "true";

const base = {
  projectId: required("ROGEROS_EMPLOYEE_STUDIO_PROJECT_ID"),
  runtimeId: required("ROGEROS_EMPLOYEE_STUDIO_RUNTIME_ID"),
  actorId: "rogeros-live-acceptance",
};
const bindings: StudioBinding[] = [
  { ...base, runtimeAssignmentId: required("ROGEROS_EMPLOYEE_STUDIO_DEFAULT_ASSIGNMENT_ID"), profileId: required("ROGEROS_EMPLOYEE_STUDIO_DEFAULT_PROFILE_ID") },
  { ...base, runtimeAssignmentId: required("ROGEROS_EMPLOYEE_STUDIO_AARAV_ASSIGNMENT_ID"), profileId: required("ROGEROS_EMPLOYEE_STUDIO_AARAV_PROFILE_ID") },
];

async function main() {
const evidence: Array<Record<string, unknown>> = [];

for (const binding of bindings) {
  let originalModel: Awaited<ReturnType<typeof employeeStudioAdapter.modelCatalog>>["current"] = null;
  let modelReceipt: StudioMutationReceipt | null = null;
  let modelRestored = false;
  let originalFile: StudioProfileFile | null = null;
  let fileReceipt: StudioMutationReceipt | null = null;
  let fileRestored = false;
  try {
    const capabilities = await employeeStudioAdapter.capabilities(binding);
    assert.equal(capabilities.model.available, true);
    assert.equal(capabilities.profileFiles.available, true);
    assert.equal(capabilities.skills.available, true);
    assert.equal(capabilities.skillLifecycle.available, false);
    assert.equal(capabilities.mcp.available, false);

    const [catalog, files, skills, denied] = await Promise.all([
      employeeStudioAdapter.modelCatalog(binding),
      employeeStudioAdapter.listProfileFiles(binding),
      employeeStudioAdapter.listSkills(binding),
      verifyStudioDefaultDeny(binding),
    ]);
    assert.equal(files.length, 4);
    assert.equal(new Set(files.map((file) => file.logicalKey)).size, 4);
    assert.equal(skills.length <= 100, true);
    assert.equal(denied.skillLifecycle.available, false);
    assert.equal(denied.mcp.available, false);
    assert.ok(catalog.current);
    originalModel = catalog.current;
    const candidate = catalog.models.find((model) => model.setupState === "READY" && model.modelId !== originalModel?.modelId);
    assert.ok(candidate, "A second READY model is required for reversible acceptance");

    const modelMutationId = randomUUID();
    modelReceipt = await employeeStudioAdapter.changeModel({ binding, mutationId: modelMutationId, catalogRevision: catalog.revision, expectedRevision: originalModel.revision, expectedFingerprint: null, provider: candidate.provider, modelId: candidate.modelId });
    const modelReplay = await employeeStudioAdapter.changeModel({ binding, mutationId: modelMutationId, catalogRevision: catalog.revision, expectedRevision: originalModel.revision, expectedFingerprint: null, provider: candidate.provider, modelId: candidate.modelId });
    assert.equal(modelReplay.receiptId, modelReceipt.receiptId);
    assert.equal((await employeeStudioAdapter.modelCatalog(binding)).current?.modelId, candidate.modelId);
    const rollback = await employeeStudioAdapter.rollbackModel({ binding, mutationId: modelMutationId, receiptId: modelReceipt.receiptId, expectedRevision: Number(modelReceipt.observed.revision), provider: originalModel.provider, modelId: originalModel.modelId });
    assert.equal(rollback.observed.modelId, originalModel.modelId);
    assert.equal((await employeeStudioAdapter.modelCatalog(binding)).current?.modelId, originalModel.modelId);
    modelRestored = true;

    originalFile = await employeeStudioAdapter.readProfileFile(binding, "memory");
    const marker = `\n\n<!-- rogeros-t3-live-acceptance-${randomUUID()} -->`;
    const nextContent = originalFile.content + marker;
    const nextDigest = createHash("sha256").update(nextContent).digest("hex");
    const fileMutationId = randomUUID();
    fileReceipt = await employeeStudioAdapter.writeProfileFile({ binding, mutationId: fileMutationId, logicalKey: "memory", expectedVersion: originalFile.version, expectedDigest: originalFile.digest, content: nextContent });
    const fileReplay = await employeeStudioAdapter.writeProfileFile({ binding, mutationId: fileMutationId, logicalKey: "memory", expectedVersion: originalFile.version, expectedDigest: originalFile.digest, content: nextContent });
    assert.equal(fileReplay.receiptId, fileReceipt.receiptId);
    const observedFile = await employeeStudioAdapter.readProfileFile(binding, "memory");
    assert.equal(observedFile.digest, nextDigest);
    const restored = await employeeStudioAdapter.restoreProfileFile({ binding, mutationId: randomUUID(), logicalKey: "memory", expectedVersion: observedFile.version, expectedDigest: observedFile.digest, restoreVersion: originalFile.version });
    assert.equal(restored.observed.digest, originalFile.digest);
    const finalFile = await employeeStudioAdapter.readProfileFile(binding, "memory");
    assert.equal(finalFile.digest, originalFile.digest);
    assert.equal(finalFile.content, originalFile.content);
    fileRestored = true;

    evidence.push({ profile: binding.profileId, modelChoices: catalog.models.length, profileFiles: files.length, skills: skills.length, modelReplay: true, modelRestored, fileReplay: true, fileRestored, skillLifecycleDenied: true, mcpDenied: true });
  } finally {
    if (originalFile && fileReceipt && !fileRestored) {
      const current = await employeeStudioAdapter.readProfileFile(binding, "memory");
      if (current.digest !== originalFile.digest) await employeeStudioAdapter.restoreProfileFile({ binding, mutationId: randomUUID(), logicalKey: "memory", expectedVersion: current.version, expectedDigest: current.digest, restoreVersion: originalFile.version });
    }
    if (originalModel && modelReceipt && !modelRestored) {
      const current = (await employeeStudioAdapter.modelCatalog(binding)).current;
      if (current && current.modelId !== originalModel.modelId) await employeeStudioAdapter.rollbackModel({ binding, mutationId: randomUUID(), receiptId: modelReceipt.receiptId, expectedRevision: current.revision, provider: originalModel.provider, modelId: originalModel.modelId });
    }
  }
}

console.log(JSON.stringify({ accepted: true, bindings: evidence }));
}

void main();
