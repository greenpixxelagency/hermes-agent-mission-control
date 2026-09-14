# RogerOS T3 Employee Studio adapter contract

This records the exact sanitized Stage 2 handoff received from the separate isolated VPS task. It is not a live-Hermes acceptance claim. Stage 2 is loopback-only, mutations remain disabled, Skill lifecycle is `UNAVAILABLE`, and MCP is `UNAVAILABLE`/default-deny.

## Client configuration

- `ROGEROS_EMPLOYEE_STUDIO_ENABLED`: explicit client feature gate; default false.
- `ROGEROS_EMPLOYEE_STUDIO_ADAPTER_URL`: loopback adapter base URL (the isolated handoff used `http://127.0.0.1:9097`).
- `ROGEROS_EMPLOYEE_STUDIO_ADAPTER_TOKEN`: bearer token, mapped server-side to `T3_AUTH_TOKEN`.
- `ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET`: request-envelope HMAC key, mapped to `T3_HMAC_SECRET`.
- `ROGEROS_EMPLOYEE_STUDIO_CATALOG_HMAC_SECRET`: distinct catalog HMAC key, mapped to `T3_CATALOG_SECRET`.

All are server-only. Missing any value means setup-required. No values, adapter URLs, signatures, raw paths, file contents, commands, credentials, or provider payloads may appear in browser state, source, logs, mutation metadata, or audit.

## Exact request envelope

Every operation is an HTTP `POST` under `/v1` with `Content-Type: application/json` and `Authorization: Bearer {adapter token}`. There is no signature HTTP header. The exact body is:

```json
{
  "contractVersion": "employee-studio-v1",
  "projectId": "opaque project ID",
  "runtimeId": "opaque runtime ID",
  "runtimeAssignmentId": "opaque assignment ID",
  "profileId": "bound profile ID",
  "actorId": "opaque project-member ID",
  "timestamp": 0,
  "nonce": "192-bit base64url value",
  "idempotencyKey": "durable RogerOS mutation ID or unique read key",
  "expectedRevision": null,
  "expectedFingerprint": null,
  "operation": "OPERATION_NAME",
  "payload": {},
  "signature": "64 lowercase hex HMAC-SHA256"
}
```

Remove `signature`, recursively sort object keys lexicographically, preserve array order, emit compact JSON, then HMAC-SHA256 with `ROGEROS_EMPLOYEE_STUDIO_HMAC_SECRET`. Timestamp is Unix epoch milliseconds with an accepted ±300,000 ms window. Nonces are durable in assignment/profile/actor scope and reject replay. Idempotency binds operation, payload, expected revision, and fingerprint; same key/hash with a fresh nonce replays the receipt, while changed content is `IDEMPOTENCY_CONFLICT`. Expected revision is null or a nonnegative safe integer; expected fingerprint is null or 64 lowercase hex.

Every success repeats exact `contractVersion`, `projectId`, `runtimeId`, `runtimeAssignmentId`, and `profileId`. Errors are bounded `{ "error": "ERROR_CODE" }`. Cross-binding substitution, extra/missing fields, stale/future timestamp, malformed signature, nonce replay, and idempotency conflict are denied.

## Exact Stage 2 endpoints

- `POST /v1/capabilities`, operation `CAPABILITIES`, payload `{}`. Response `capabilities` is exactly five `{name,state}` rows: `models`, `profileFiles`, `skills`, `skillLifecycle`, `mcp`; states are `READY`, `SETUP_REQUIRED`, or `UNAVAILABLE`. Current handoff: first three ready, lifecycle/MCP unavailable.
- `POST /v1/models/catalog`, `MODEL_CATALOG`, `{}`. Response catalog is `{models:[{id,state}],revision,expiresAt,expired}` plus `signature`. Catalog signature is a distinct lowercase-hex HMAC over `JSON.stringify` of the common response identity followed by `catalog`, before signature is added.
- `POST /v1/models/read`, `MODEL_READ`, `{}` → `model:{id,revision}`.
- `POST /v1/models/set`, `MODEL_SET`, required expected revision, payload `{modelId,observedModelId}`. Success receipt is `{kind:"MODEL_UPDATED",modelId,previousModelId,revision,confirmed:true}`. Observation mismatch returns `{kind:"MODEL_ROLLBACK",requestedModelId,restoredModelId,revision,confirmed:false}` without advancing revision. Only currently `READY` catalog models are accepted.
- `POST /v1/profile-files/read`, `PROFILE_FILE_READ`, payload `{key}` → `file:{key,content,digest,revision}`.
- `POST /v1/profile-files/update`, `PROFILE_FILE_UPDATE`, required expected revision, payload `{key,content}` → bounded update receipt.
- `POST /v1/profile-files/restore`, `PROFILE_FILE_RESTORE`, required current revision, payload `{key,backupRevision}` → restore receipt.
- `POST /v1/skills/inventory`, `SKILL_INVENTORY`, `{}` → `inventory:{skills:[{id,state,version}],revision}`; at most 100 rows and states `AVAILABLE`, `ENABLED`, `DISABLED`, or `UNAVAILABLE`.
- `POST /v1/skills/read`, `SKILL_READ`, payload `{skillId}` → bounded safe projection `{skill:{id,state,content,digest}}`.
- `POST /v1/skills/lifecycle`, `SKILL_LIFECYCLE`, payload `{skillId,action}`. Stage 2 always returns `UNAVAILABLE`, `changed:false`, reason `STAGE_2_DEFAULT_DENY`.
- `POST /v1/mcp`, `MCP`, `{}`. Stage 2 always returns `allowed:false`, state `UNAVAILABLE`, reason `STAGE_2_DEFAULT_DENY`. Clients must send no secret material.

Profile keys are exactly `identity`, `preferences`, `instructions`, and `memory`. No caller path is accepted. The isolated adapter enforces fixed roots, containment, no symlinks, bounded valid UTF-8, digest/revision CAS, atomic mode-0600 writes, and persistent backups. The repository stores its own immutable, project-owned recovery versions without putting content in audit.

Stage 2 validates expected-fingerprint shape/signing but does not compare it to stored state, exposes no explicit compensating model endpoint, and installs with mutations disabled. Therefore the repository keeps the feature gate false and must not claim model/file mutation, Skill lifecycle, MCP, or two-profile live acceptance until a later isolated handoff closes those gaps.

## Copy-ready isolated VPS continuation prompt

> Continue only the isolated T3 acceptance service described in `ROGEROS_T3_EMPLOYEE_STUDIO_CONTRACT.md`. First re-verify the authoritative isolated source/deployment, loopback-only `127.0.0.1:9097` listener, exact two acceptance bindings, independent mode-0600 secrets, service health, and protected staging/production hashes; stop if they differ. Do not touch RogerOS source/database, Vercel, production Hermes/bridge, T2A, Docker/public routes, real profiles/content, firewall, DNS, TLS, browser control, lessons, or unrelated services. Preserve the exact flat `/v1` envelope, recursive canonical HMAC, five-minute timestamp window, durable nonce/idempotency scopes, distinct catalog signature, strict response identity, logical file allowlist, safe logs, and bounded errors. Add explicit assignment-bound compensating model and file rollback operations or equivalent provable receipts; enforce stored expected fingerprints; implement trusted exact-version Skill lifecycle plus rollback only if its isolated governance can be proven; keep MCP `UNAVAILABLE` unless protected secret-reference and per-tool authorization/rollback can be proven end to end. Run deterministic tests for both bindings, replay/conflict, stale revision/fingerprint, catalog expiry/tamper, observed mismatch/rollback, traversal/encoded/Unicode/NUL/symlink/hard-link/TOCTOU, oversize/invalid UTF-8, restore/restart durability, Skill trust/version/isolation, MCP default deny, redaction, listener isolation, and protected invariants. Leave mutations and the service default-deny after testing unless the owner explicitly authorizes a bounded acceptance window. Return sanitized paths/hashes, test counts, exact capability matrix, health/isolation evidence, rollback steps, remaining gaps, and `PROVEN` or `NOT_PROVEN`; never return secret values, credentials, auth headers, HMACs, file content, absolute profile paths, commands, or provider payloads.
