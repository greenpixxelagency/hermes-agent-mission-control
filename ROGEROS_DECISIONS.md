# RogerOS decision log

## SaaS-first generic tenancy

**Decision:** Organizations, Projects, memberships, and project-owned records are generic product concepts. Buddhaji and Vhalam are dogfood only.

**Reason:** RogerOS must serve unrelated external customers without code changes.

**Consequences:** Product behavior cannot branch on dogfood names, slugs, IDs, credentials, or business assumptions. Dogfood fixtures remain isolated to staging/tests.

## RogerOS is the control plane; Hermes is the execution runtime

**Decision:** Hermes performs AI execution. RogerOS owns authoritative business and governance state.

**Reason:** Execution providers are replaceable and cannot safely own tenancy or business authorization.

**Consequences:** RogerOS compiles desired runtime state, dispatches through typed adapters, observes/reconciles results, and records audit evidence. Direct runtime mutation is avoided when a RogerOS workflow exists.

## Task is not a runtime task

**Decision:** A RogerOS Task remains authoritative work; `HermesExecution` represents an execution attempt.

**Reason:** Work lifecycle, assignment, approval, and history must survive provider changes and retries.

**Consequences:** Provider IDs/results attach to project-owned executions and activities rather than replacing Tasks.

## Project Brain is not runtime memory

**Decision:** Constitution, knowledge, decisions, memory, and provenance belong to Project Brain in RogerOS.

**Reason:** Durable business truth needs project isolation, provenance, governance, and stable ownership.

**Consequences:** Runtime memory may support execution but is not the authoritative Brain record.

## Project isolation and server-side authorization

**Decision:** Project ownership is enforced in database relationships and server-side context/services.

**Reason:** Client filters, slugs, prompts, and runtime profiles are not security boundaries.

**Consequences:** Cross-project access is indistinguishable from missing data, default access is denied, and isolation regressions are required near tenancy changes.

## RogerOS enforces permissions, policies, approvals, and audit

**Decision:** External actions require RogerOS Tool permission and policy evaluation; consequential actions may require approval and always produce governed lifecycle records.

**Reason:** Runtime capability alone must not grant business authority.

**Consequences:** Runtime assignment and Tool permission remain separate. Adapters execute decisions already authorized by RogerOS.

## Governed skills

**Decision:** Skills come from a trusted catalog, are assigned per project employee, provisioned only from a fixed safe allowlist, and reconciled per runtime profile.

**Reason:** Arbitrary paths, packages, or prompts would bypass the control plane.

**Consequences:** Provisioned artifacts are not automatically active; active observed state is constrained by the authoritative approved overlay and audited.

## Staging before production

**Decision:** Schema, integration, deployment, and runtime acceptance occur in isolated staging before production authorization.

**Reason:** Runtime and migration failures must not threaten customer/production state.

**Consequences:** Staging success never implies permission to alter production. Never assume production migration history from local or staging status.

## AI completion requires human review

**Decision:** A successful Hermes execution makes the latest Task result ready for review; it does not complete authoritative business work. OWNER, ADMIN, or APPROVER must accept it before the Task becomes done.

**Reason:** Provider success proves execution finished, not that the business result is correct or approved.

**Consequences:** RogerOS preserves every execution attempt and review decision, supports revision and explicit retry, prevents stale attempts from changing current Task state, and audits the complete lifecycle.

## Runtime completion is authenticated and idempotent

**Decision:** The isolated adapter reports terminal status using a timestamped HMAC callback, with bounded polling as a reconciliation fallback.

**Reason:** Serverless request lifetimes cannot be the only completion mechanism, while runtime payloads cannot be trusted to supply tenancy or authorization.

**Consequences:** Callback payloads contain only the external execution identity and terminal result. RogerOS derives project ownership from stored records, rejects forged, stale, oversized, malformed, conflicting, and replayed state changes, and treats exact duplicates as idempotent.
