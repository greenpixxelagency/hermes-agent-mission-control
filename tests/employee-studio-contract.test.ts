import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  EMPLOYEE_STUDIO_CONTRACT,
  employeeStudioAdapter,
  employeeStudioAdapterConfigured,
  isAllowedProfileFileKey,
  parseStudioCapabilities,
  parseStudioModelCatalog,
  parseStudioMutationReceipt,
  validateStudioBinding,
  type StudioBinding,
} from "../src/lib/employee-studio-adapter";

const binding: StudioBinding = {
  projectId: "project_12345678",
  runtimeId: "runtime_12345678",
  runtimeAssignmentId: "assignment_12345678",
  profileId: "researcher-01",
  actorId: "member_12345678",
};
const common = { contractVersion: EMPLOYEE_STUDIO_CONTRACT, projectId: binding.projectId, runtimeId: binding.runtimeId, runtimeAssignmentId: binding.runtimeAssignmentId, profileId: binding.profileId };

test("employee-studio-v1 validates exact assignment binding and truthful capability states", () => {
  assert.deepEqual(validateStudioBinding(binding), binding);
  const payload = { ...common, capabilities: [{ name: "models", state: "READY" }, { name: "profileFiles", state: "SETUP_REQUIRED" }, { name: "skills", state: "READY" }, { name: "skillLifecycle", state: "UNAVAILABLE" }, { name: "mcp", state: "UNAVAILABLE" }] };
  assert.equal(parseStudioCapabilities(payload, binding).profileFiles.reason, "SETUP_REQUIRED");
  assert.throws(() => parseStudioCapabilities({ ...payload, projectId: "project_other123" }, binding), /BINDING_MISMATCH/);
  assert.throws(() => parseStudioCapabilities({ ...payload, capabilities: payload.capabilities.map((item) => item.name === "models" ? { ...item, state: "UNKNOWN" } : item) }, binding), /MALFORMED_STATE/);
  assert.throws(() => parseStudioCapabilities({ ...payload, extra: true }, binding), /MALFORMED_RESPONSE/);
});

test("profile files accept logical keys only and reject traversal and raw paths", () => {
  for (const logicalKey of ["identity", "preferences", "instructions", "memory"]) assert.equal(isAllowedProfileFileKey(logicalKey), true);
  for (const logicalKey of ["../identity", "/etc/passwd", "C:\\secrets.txt", "skills/one-three-one-rule/SKILL.md", "skills/x/../../secret", "credentials", "SOUL.md"]) assert.equal(isAllowedProfileFileKey(logicalKey), false);
});

function signedCatalog(overrides: Record<string, unknown> = {}, secret = "catalog-signing-secret") {
  const catalog = { models: [{ id: "baseline", state: "READY" }, { id: "candidate", state: "SETUP_REQUIRED" }], revision: 1, expiresAt: Date.now() + 120_000, expired: false, ...overrides };
  const unsigned = { ...common, catalog };
  return { ...unsigned, signature: createHmac("sha256", secret).update(JSON.stringify(unsigned)).digest("hex") };
}

test("signed model catalogs reject tamper, expiry, duplicate pairs, and binding substitution", () => {
  const valid = signedCatalog();
  assert.equal(parseStudioModelCatalog(valid, binding, "catalog-signing-secret").revision, "1");
  assert.throws(() => parseStudioModelCatalog({ ...valid, catalog: { ...valid.catalog, revision: 2 } }, binding, "catalog-signing-secret"), /SIGNATURE_INVALID/);
  assert.throws(() => parseStudioModelCatalog({ ...valid, profileId: "other-profile" }, binding, "catalog-signing-secret"), /BINDING_MISMATCH/);
  assert.throws(() => parseStudioModelCatalog(signedCatalog({ expiresAt: Date.now() - 1, expired: true }), binding, "catalog-signing-secret"), /STALE_MODEL_CATALOG/);
  assert.throws(() => parseStudioModelCatalog(signedCatalog({ models: [{ id: "baseline", state: "READY" }, { id: "baseline", state: "READY" }] }), binding, "catalog-signing-secret"), /MALFORMED_MODEL_CATALOG/);
});

test("mutation receipts are assignment-bound, idempotency-bound, exact, and secret-redacted", () => {
  const receipt = { ...common, receipt: { kind: "MODEL_UPDATED", modelId: "candidate", previousModelId: "baseline", revision: 8, confirmed: true } };
  assert.equal(parseStudioMutationReceipt(receipt, binding, "mutation_12345678").observed.modelId, "candidate");
  assert.throws(() => parseStudioMutationReceipt({ ...receipt, profileId: "other-profile" }, binding, "mutation_12345678"), /BINDING_MISMATCH/);
  assert.throws(() => parseStudioMutationReceipt({ ...common, receipt: { token: "top-secret-value" } }, binding, "mutation_12345678"), /MALFORMED_RECEIPT/);
  assert.throws(() => parseStudioMutationReceipt({ ...receipt, providerPayload: {} }, binding, "mutation_12345678"), /MALFORMED_RESPONSE/);
});

test("production adapter remains default-deny unless the full signed configuration is present", () => {
  const previous = { enabled: process.env.ROGEROS_EMPLOYEE_STUDIO_ENABLED, url: process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL, token: process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN, secret: process.env.ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET, catalog: process.env.ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET };
  try {
    delete process.env.ROGEROS_EMPLOYEE_STUDIO_ENABLED; delete process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL; delete process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN; delete process.env.ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET; delete process.env.ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET;
    assert.equal(employeeStudioAdapterConfigured(), false);
    process.env.ROGEROS_EMPLOYEE_STUDIO_ENABLED = "true"; process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL = "https://adapter.invalid"; process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN = "auth-token"; process.env.ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET = "catalog-secret";
    assert.equal(employeeStudioAdapterConfigured(), false);
    process.env.ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET = "signing-secret";
    assert.equal(employeeStudioAdapterConfigured(), true);
  } finally {
    for (const [name, value] of [["ROGEROS_EMPLOYEE_STUDIO_ENABLED", previous.enabled], ["ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL", previous.url], ["ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN", previous.token], ["ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET", previous.secret], ["ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET", previous.catalog]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test("adapter requests bind identity, expiry, nonce, mutation idempotency, and independent HMAC", async () => {
  const previous = { enabled: process.env.ROGEROS_EMPLOYEE_STUDIO_ENABLED, url: process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL, token: process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN, secret: process.env.ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET, catalog: process.env.ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET, fetch: global.fetch };
  const bodies: Array<Record<string, unknown>> = [];
  try {
    process.env.ROGEROS_EMPLOYEE_STUDIO_ENABLED = "true"; process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL = "https://adapter.invalid"; process.env.ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN = "bearer-is-not-signing-secret"; process.env.ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET = "independent-signing-secret"; process.env.ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET = "catalog-signing-secret";
    global.fetch = async (input, init) => {
      const url = String(input), path = new URL(url).pathname, bodyText = String(init?.body), body = JSON.parse(bodyText) as Record<string, unknown>;
      bodies.push(body);
      const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
      const { signature, ...unsigned } = body;
      const expected = createHmac("sha256", "independent-signing-secret").update(stable(unsigned)).digest("hex");
      assert.equal(signature, expected);
      assert.equal(new Headers(init?.headers).get("X-RogerOS-Studio-Signature"), null);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer bearer-is-not-signing-secret");
      assert.equal(path.startsWith("/v1/"), true);
      if (path.endsWith("/capabilities")) return Response.json({ ...common, capabilities: [{ name: "models", state: "READY" }, { name: "profileFiles", state: "READY" }, { name: "skills", state: "READY" }, { name: "skillLifecycle", state: "UNAVAILABLE" }, { name: "mcp", state: "UNAVAILABLE" }] });
      return Response.json({ ...common, receipt: { kind: "MODEL_UPDATED", modelId: "candidate", previousModelId: "baseline", revision: 8, confirmed: true } });
    };
    await employeeStudioAdapter.capabilities(binding);
    const mutation = { binding, mutationId: "mutation_12345678", catalogRevision: "1", expectedRevision: 7, expectedFingerprint: "a".repeat(64), provider: "hermes", modelId: "candidate", observedModelId: "candidate" };
    await employeeStudioAdapter.changeModel(mutation); await employeeStudioAdapter.changeModel(mutation);
    for (const body of bodies) for (const [key, value] of Object.entries(binding)) assert.equal(body[key], value);
    assert.equal(bodies[1].idempotencyKey, mutation.mutationId); assert.equal(bodies[2].idempotencyKey, mutation.mutationId);
    assert.notEqual(bodies[1].nonce, bodies[2].nonce);
    for (const body of bodies) assert.equal(Math.abs(Date.now() - Number(body.timestamp)) < 5_000, true);
  } finally {
    global.fetch = previous.fetch;
    for (const [name, value] of [["ROGEROS_EMPLOYEE_STUDIO_ENABLED", previous.enabled], ["ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL", previous.url], ["ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN", previous.token], ["ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET", previous.secret], ["ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET", previous.catalog]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
