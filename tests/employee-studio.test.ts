import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EMPLOYEE_STUDIO_CONTRACT,
  employeeStudioAdapterConfigured,
  isAllowedProfileFileKey,
  parseStudioCapabilities,
  parseStudioCatalog,
  parseStudioProfileFile,
  parseStudioReceipt,
  parseStudioDefaultDeny,
  signStudioEnvelope,
  studioModelSetPayload,
  studioNonce,
  type StudioBinding,
} from "../src/lib/employee-studio-adapter";
import { validateEmployeeStudioProfileContent } from "../src/lib/employee-studio";

const binding: StudioBinding = {
  projectId: "project-12345678",
  runtimeId: "runtime-12345678",
  runtimeAssignmentId: "assignment-12345678",
  profileId: "aarav",
  actorId: "member-12345678",
};
const common = {
  contractVersion: EMPLOYEE_STUDIO_CONTRACT,
  projectId: binding.projectId,
  runtimeId: binding.runtimeId,
  runtimeAssignmentId: binding.runtimeAssignmentId,
  profileId: binding.profileId,
};

test("capability parser preserves explicit Stage 2 default deny", () => {
  const parsed = parseStudioCapabilities({ ...common, capabilities: [
    { name: "models", state: "READY" },
    { name: "profileFiles", state: "READY" },
    { name: "skills", state: "READY" },
    { name: "skillLifecycle", state: "UNAVAILABLE" },
    { name: "mcp", state: "UNAVAILABLE" },
  ] }, binding);
  assert.equal(parsed.model.available, true);
  assert.equal(parsed.profileFiles.available, true);
  assert.equal(parsed.skillLifecycle.available, false);
  assert.equal(parsed.mcp.reason, "UNAVAILABLE");
});

test("capability parser rejects extra fields and identity mismatch", () => {
  const capabilities = [
    { name: "models", state: "READY" }, { name: "profileFiles", state: "READY" },
    { name: "skills", state: "READY" }, { name: "skillLifecycle", state: "UNAVAILABLE" },
    { name: "mcp", state: "UNAVAILABLE" },
  ];
  assert.throws(() => parseStudioCapabilities({ ...common, capabilities, extra: true }, binding), /MALFORMED/);
  assert.throws(() => parseStudioCapabilities({ ...common, projectId: "project-other", capabilities }, binding), /BINDING_MISMATCH/);
});

test("catalog requires distinct valid HMAC and bounded unique entries", () => {
  const secret = "catalog-secret-for-tests";
  const unsigned = { ...common, catalog: { models: [{ id: "baseline", state: "READY" }, { id: "setup-model", state: "SETUP_REQUIRED" }], revision: 7, expiresAt: Date.now() + 60_000, expired: false } };
  const signature = createHmac("sha256", secret).update(JSON.stringify(unsigned)).digest("hex");
  assert.equal(parseStudioCatalog({ ...unsigned, signature }, binding, secret).revision, 7);
  assert.throws(() => parseStudioCatalog({ ...unsigned, signature: "0".repeat(64) }, binding, secret), /SIGNATURE_INVALID/);
  const duplicate = { ...unsigned, catalog: { ...unsigned.catalog, models: [{ id: "baseline", state: "READY" }, { id: "baseline", state: "READY" }] } };
  const duplicateSignature = createHmac("sha256", secret).update(JSON.stringify(duplicate)).digest("hex");
  assert.throws(() => parseStudioCatalog({ ...duplicate, signature: duplicateSignature }, binding, secret), /MALFORMED/);
});

test("profile files accept only fixed logical keys and verified content", () => {
  const content = "# Memory\nBounded profile content.";
  const digest = createHash("sha256").update(content).digest("hex");
  const parsed = parseStudioProfileFile({ ...common, file: { key: "memory", content, digest, revision: 0 } }, binding);
  assert.equal(parsed.logicalKey, "memory");
  for (const unsafe of ["../memory", "/etc/passwd", "SOUL.md", "skills/demo/SKILL.md", "%2e%2e/memory"]) assert.equal(isAllowedProfileFileKey(unsafe), false);
  assert.throws(() => parseStudioProfileFile({ ...common, file: { key: "memory", content: `${content}!`, digest, revision: 0 } }, binding), /MALFORMED/);
});

test("profile writes deny secret-shaped content before adapter mutation", () => {
  assert.throws(() => validateEmployeeStudioProfileContent("memory", "api_key=super-secret-value-123"), /PROFILE_FILE_SECRET_DENIED/);
  assert.throws(() => validateEmployeeStudioProfileContent("../memory", "safe content"), /PROFILE_FILE_NOT_EDITABLE/);
  assert.equal(validateEmployeeStudioProfileContent("identity", "# Identity\nSafe bounded text.").bytes > 0, true);
});

test("mutation receipts reject reconciliation identity and shape drift", () => {
  const updated = { ...common, receipt: { kind: "MODEL_UPDATED", modelId: "provider/model", previousModelId: "baseline", revision: 1, confirmed: true } };
  assert.equal(parseStudioReceipt(updated, binding, "mutation-12345678").observed.modelId, "provider/model");
  assert.throws(() => parseStudioReceipt({ ...updated, receipt: { ...updated.receipt, confirmed: false } }, binding, "mutation-12345678"), /MALFORMED/);
  assert.throws(() => parseStudioReceipt({ ...updated, profileId: "other" }, binding, "mutation-12345678"), /BINDING_MISMATCH/);
});

test("model mutation validates the requested model as the post-change observation", () => {
  assert.deepEqual(studioModelSetPayload("candidate"), { modelId: "candidate", observedModelId: "candidate" });
  assert.throws(() => studioModelSetPayload("../unsafe model"), /INVALID_MODEL/);
});

test("adapter nonces always satisfy the Stage-2 envelope grammar", () => {
  for (let index = 0; index < 256; index += 1) assert.match(studioNonce(), /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/);
});

test("Stage 2 Skill lifecycle and MCP denial receipts are exact", () => {
  assert.equal(parseStudioDefaultDeny({ ...common, receipt: { kind: "SKILL_LIFECYCLE", state: "UNAVAILABLE", changed: false, reason: "STAGE_2_DEFAULT_DENY" } }, binding, "skillLifecycle").available, false);
  assert.equal(parseStudioDefaultDeny({ ...common, capability: { name: "mcp", state: "UNAVAILABLE", allowed: false, reason: "STAGE_2_DEFAULT_DENY" } }, binding, "mcp").available, false);
  assert.throws(() => parseStudioDefaultDeny({ ...common, capability: { name: "mcp", state: "READY", allowed: true, reason: "ok" } }, binding, "mcp"), /MALFORMED/);
});

test("envelope HMAC recursively canonicalizes object keys", () => {
  assert.equal(signStudioEnvelope({ z: 1, a: { y: 2, x: 3 } }, "secret"), signStudioEnvelope({ a: { x: 3, y: 2 }, z: 1 }, "secret"));
});

test("live adapter is default deny without every local gate", () => {
  const keys = ["ROGEROS_EMPLOYEE_STUDIO_ENABLED", "ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL", "ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN", "ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET", "ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try { for (const key of keys) delete process.env[key]; assert.equal(employeeStudioAdapterConfigured(), false); process.env.ROGEROS_EMPLOYEE_STUDIO_ENABLED = "true"; assert.equal(employeeStudioAdapterConfigured(), false); }
  finally { for (const key of keys) { const value = previous[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test("migration is additive and encodes project-owned isolation keys", async () => {
  const sql = await readFile(new URL("../prisma/migrations/20260915010000_add_employee_studio_foundation/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /RuntimeConfigurationMutation_projectId_idempotencyKey_key/);
  assert.match(sql, /StudioProfileFile_projectId_runtimeAssignmentId_logicalKey_key/);
  assert.match(sql, /GovernedMcpAssignment_projectId_runtimeAssignmentId_serverKey_key/);
  assert.match(sql, /ConnectionCredential_id_projectId_connectionId_key/);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN|TYPE)/i);
});
