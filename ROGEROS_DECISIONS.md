# RogerOS decision log

## SaaS-first generic tenancy

**Decision:** Organizations, Projects, memberships, and project-owned records are generic product concepts. Buddhaji and Vhalam are dogfood only.

**Reason:** RogerOS must serve unrelated external customers without code changes.

**Consequences:** Product behavior cannot branch on dogfood names, slugs, IDs, credentials, or business assumptions. Dogfood fixtures remain isolated to staging/tests.

## Legacy Hermy HQ and RogerOS remain explicitly separated

**Decision:** The repository may temporarily contain upstream Hermy HQ screens, bridge code, and legacy schema models beside RogerOS, but only `/p/[projectSlug]` and its project-scoped services are RogerOS product evidence.

**Reason:** Reusing a repository does not safely turn an older single-operator dashboard into a multi-tenant control plane.

**Consequences:** Do not count legacy screens as RogerOS functionality, route RogerOS work through its server-resolved project context, and require an explicit owner-approved migration/retirement plan before coupling or deleting either system. The root README must label its historical Hermy HQ instructions accordingly.

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

## Phase 3 sequencing follows governed dependencies

**Decision:** Future Phase 3 work is planned from the original blueprint, reconciled against verified repository evidence, and delivered one bounded milestone at a time. A planning document is not implementation approval.

**Reason:** The original blueprint contains the product direction, while the current repository contains deliberate scope reductions, added security boundaries, and completed work that must not be recreated or bypassed.

**Consequences:** The remaining order is capability configuration, then outcome evidence, then recommendations/automation, then advanced workplace and SaaS productization. Customer onboarding, billing, production promotion, and credential-sensitive browser work cannot be pulled into M17 by inference.

## Employee Market provenance is immutable and capability-default-deny

**Decision:** M17 market templates are curated global catalog versions, while each hire creates a distinct project-owned Employee, EmployeeProjectAssignment, provenance record, and safe configuration snapshot. OWNER and ADMIN authorization is enforced in the shared server-side hiring service for both market and custom hiring.

**Reason:** A template catalog must not become a mutable cross-project employee or capability control channel, and UI-only hiring restrictions are not authorization.

**Consequences:** Repeated hiring of the same template is idempotent per project. Recommended Skills and Tools can be selected and audited as metadata but create no Skill assignment, Tool permission, connection, credential, or runtime assignment. Pausing/resuming/retiring employment preserves existing Tasks, executions, review evidence, and history; retirement disables only the existing RogerOS runtime assignment record and does not add runtime transport behavior.

## App Market installations are curated provenance, not capability grants

**Decision:** M18 represents catalog entries as versioned, non-secret manifests and project selections as lifecycle-managed installation provenance that links to the existing governed `ProjectTool`.

**Reason:** Installing an app must not become a second execution system or a mechanism for distributing credentials and employee authority.

**Consequences:** OWNER and ADMIN authority is enforced server-side. Installation creates no employee Tool permission, ProjectConnection credential, scope, policy exception, or adapter behavior. Lifecycle mutations require a project-scoped idempotency key; only a typed provider callback or explicit manager health check may establish connected health. Disable/uninstall blocks execution and pending approval work while preserving audit/history. Connection health and encrypted credential material remain in the existing Connection models; audit metadata is secret-safe.

## AI completion requires human review

**Decision:** A successful Hermes execution makes the latest Task result ready for review; it does not complete authoritative business work. OWNER, ADMIN, or APPROVER must accept it before the Task becomes done.

**Reason:** Provider success proves execution finished, not that the business result is correct or approved.

**Consequences:** RogerOS preserves every execution attempt and review decision, supports revision and explicit retry, prevents stale attempts from changing current Task state, and audits the complete lifecycle.

## Runtime completion is authenticated and idempotent

**Decision:** The isolated adapter reports terminal status using a timestamped HMAC callback, with bounded polling as a reconciliation fallback.

**Reason:** Serverless request lifetimes cannot be the only completion mechanism, while runtime payloads cannot be trusted to supply tenancy or authorization.

**Consequences:** Callback payloads contain only the external execution identity and terminal result. RogerOS derives project ownership from stored records, rejects forged, stale, oversized, malformed, conflicting, and replayed state changes, treats exact duplicates as idempotent, and enforces the byte limit while streaming before JSON parsing. Runtime refresh uses dispatch authority because reconciliation can change authoritative state.

Vercel Deployment Protection requires a project-scoped automation bypass credential for the isolated adapter callback. The credential is stored only in the protected staging adapter environment, sent only to the fixed Preview callback URL, rotated as a secret, and never treated as a production or tenancy authorization boundary.
