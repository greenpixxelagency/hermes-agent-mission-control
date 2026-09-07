# RogerOS decision log

## SaaS-first generic tenancy

**Decision:** Organizations, Projects, memberships, and project-owned records are generic product concepts. Buddhaji and Vhalam are dogfood only.

**Reason:** RogerOS must serve unrelated external customers without code changes.

**Consequences:** Product behavior cannot branch on dogfood names, slugs, IDs, credentials, or business assumptions. Dogfood fixtures remain isolated to staging/tests.

## Single-project-first UX preserves multi-project authority

**Decision:** RogerOS may hide project selection and route a member into one server-resolved active workspace during the Hermes control-desk rollout. It will retain the existing project-scoped schema, authorization, adapter binding, policy, approval, audit, tool, connection, schedule, and browser-session boundaries.

**Reason:** The first operational experience should be easy to use without creating a future migration that can mix employees, Hermes profiles, credentials, or browser sessions across customer workspaces.

**Consequences:** A single-project route is a presentation/default-context choice only. `projectId` remains authoritative and must be derived server-side on every read or mutation. Future multi-project work restores a context switcher; it must not introduce global profile inventories, slug-derived ownership, client-supplied project authority, or cross-project profile reuse. Each Hermes profile binding is single-project by default; reuse requires an explicit, audited clone/import action.

## Hermes adapter bindings are signed projections, not authority

**Decision:** RogerOS registers an existing Hermes profile through the staging adapter using its opaque database IDs, a short-lived timestamp, single-use random nonce, and HMAC created with the existing server-only adapter credential. The protected adapter binding registry projects, but does not replace, the `HermesRuntimeAssignment` authority record.

**Consequences:** Project roster and assignment-capability reads use the registered opaque binding; a profile name, slug, UI selection, or raw Hermes profile list cannot establish ownership. Registration is immutable and idempotent, has no capability-grant side effect, and failure keeps the UI/default policy unavailable. The signer and credential never reach browser code, logs, audits, or the adapter's returned errors.

## Browser-only Hermes environments are isolated per bot

**Decision:** RogerOS will use a browser-only—not full-desktop—environment for each Hermes runtime assignment. Viewer and takeover access must be mediated by short-lived, signed, user-bound leases that bind opaque `projectId`, `runtimeAssignmentId`, `profileId`, and authorized user identity. Human takeover is available only after the adapter has exclusively revoked the agent's browser input for that specific assignment.

**Reason:** The product needs focused browser work and supervised intervention, not a shared remote desktop. A browser-only design lowers the exposed surface while retaining the governance boundary RogerOS needs.

**Consequences:** A shared Camofox/VNC session, raw browser URL, profile key, display name, or client-supplied project ID cannot grant viewing or input. The adapter must advertise browser/takeover capability as false until it can enforce assignment isolation, lease expiry/revocation, exclusive input handoff, and user-claim validation. Observation recording must consume redacted, assignment-bound semantic events and produce review-only drafts; it must never capture raw VNC/CDP traffic, credentials, cookies, or unrelated tabs.

## Custom staging browser-control relay is approved

**Decision:** Until Hermes/Camofox provides native assignment-scoped input ownership, RogerOS may use a separately reviewed, staging-only custom browser-control relay. It must be the sole network ingress for both Hermes browser commands and human viewer/input traffic to a dedicated browser process, enforce an atomic per-assignment owner lock, and default to deny.

**Reason:** The official integration cannot prove that human takeover excludes every Hermes browser-input path, and a process-wide view-only setting cannot safely hand a live session to a human.

**Consequences:** A VNC/RFB input filter alone is insufficient. Network policy must prevent direct Hermes, dashboard, cron, human, and public access to the browser; all browser-producing paths must traverse the relay. The relay must terminate active agent input before allowing human input, terminate human input before resuming the agent, bind short-lived signed leases to an opaque assignment and user, and preserve auditable transition evidence. Teaching may use only a redacted semantic event stream from this relay/instrumentation; raw frames, typed values, cookies, clipboard, uploads, and unrelated-tab activity are prohibited.

## Dedicated Hermes runtime per browser-controlled assignment is approved

**Decision:** Each staging assignment that receives the custom browser-control relay will run in its own dedicated Hermes runtime with a distinct relay credential and an isolated network path only to that assignment's browser. The approved migration copies only that assignment's protected staging profile and required provider configuration.

**Reason:** Hermes v0.20.5 sends shared-runtime Camofox requests with client-controlled identity values; the relay cannot derive trustworthy assignment ownership from them. A dedicated runtime gives the relay an unforgeable service-level origin to bind to the existing opaque RogerOS assignment.

**Consequences:** Runtime creation, credential issuance, profile/configuration migration, start/stop, and retirement are staging-only lifecycle operations and must be audited by the adapter/RogerOS binding workflow. Credentials stay in protected runtime/relay configuration and are never copied to client code, logs, return payloads, or source control. A runtime may reach only its assigned relay/browser network; no shared runtime may use the browser-control path.

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

## M22 search is a bounded metadata projection

**Decision:** M22 searches only Task display metadata, employee project-assignment display metadata, and native Project Brain titles/statuses for the server-authorized current project. It intentionally excludes approvals/workflows until a dedicated safe read projection is specified and verified.

**Rationale:** Matching or returning execution, provider, credential, connection, external-source, legacy Hermy HQ, or free-form content would widen the disclosure boundary. A 24-result, GET-only metadata projection preserves useful go-to behavior without creating an action surface.

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

## Human Drive workspace reads are role-bound, not employee impersonation

**Decision:** M19 permits human Google Drive browsing only for project OWNER and ADMIN roles, using the installed/healthy connection, explicit project scopes, active read-policy check, and typed read-only adapter. Employee Tool permissions continue to govern employees only.

**Reason:** Reusing an employee assignment for a human would silently grant or misrepresent authority. A durable per-human capability-grant model has not been approved.

**Consequences:** OPERATOR, APPROVER, and VIEWER cannot call the workspace API. Uninstalled, disabled, unhealthy, unavailable-credential, policy-blocked, and out-of-scope requests stop before a successful provider read. REQUIRE_APPROVAL is also denied because human workspace reads have no approval execution lifecycle. No Drive writes, credential exposure, automatic source grants, or new durable permission records are introduced.

## AI completion requires human review

**Decision:** A successful Hermes execution makes the latest Task result ready for review; it does not complete authoritative business work. OWNER, ADMIN, or APPROVER must accept it before the Task becomes done.

**Reason:** Provider success proves execution finished, not that the business result is correct or approved.

**Consequences:** RogerOS preserves every execution attempt and review decision, supports revision and explicit retry, prevents stale attempts from changing current Task state, and audits the complete lifecycle.

## Runtime completion is authenticated and idempotent

**Decision:** The isolated adapter reports terminal status using a timestamped HMAC callback, with bounded polling as a reconciliation fallback.

**Reason:** Serverless request lifetimes cannot be the only completion mechanism, while runtime payloads cannot be trusted to supply tenancy or authorization.

**Consequences:** Callback payloads contain only the external execution identity and terminal result. RogerOS derives project ownership from stored records, rejects forged, stale, oversized, malformed, conflicting, and replayed state changes, treats exact duplicates as idempotent, and enforces the byte limit while streaming before JSON parsing. Runtime refresh uses dispatch authority because reconciliation can change authoritative state.

Vercel Deployment Protection requires a project-scoped automation bypass credential for the isolated adapter callback. The credential is stored only in the protected staging adapter environment, sent only to the fixed Preview callback URL, rotated as a secret, and never treated as a production or tenancy authorization boundary.

## Workforce scorecards are computed evidence, not cost estimation

**Decision:** M20 computes bounded project workforce outcome evidence from existing Task, HermesExecution, and ToolExecution records without adding a cost ledger or provider payload storage.

**Reason:** The authoritative schema proves assignment, lifecycle, review, and governed capability facts, but contains no trustworthy provider usage or actual-cost record. Converting absent information into a synthetic estimate would overclaim and create false billing evidence.

**Consequences:** OWNER, ADMIN, OPERATOR, and APPROVER can read redacted aggregates for their project; VIEWER cannot. Costs are returned as unavailable with `NO_PROVIDER_USAGE_RECORD`, not zero or estimated. The slice adds no Coach, recommendations, automation, billing, provider calls, or durable scorecard record.

## Agent Coach is a read-only human-review projection

**Decision:** M21 derives a small, deterministic review queue from M20's redacted project-only aggregates. It is GET-only and does not persist, apply, approve, dispatch, or otherwise execute a recommendation.

**Reason:** Outcome aggregates can flag a need for human investigation, but cannot safely determine the correct Skill, policy, SOUL, permission, runtime, or business change.

**Consequences:** Coach output states the observed aggregate and a review question with explicit safeguards. It makes no provider/AI call, exposes no execution content or credentials, and creates no permission, Skill, policy, Soul, runtime, task, approval, billing, production, or Hermes/VPS mutation. A human must initiate any subsequent change through the existing project-scoped authorization and audit flow.
