# RogerOS Phase 3 reconciliation and forward plan

> **Planning record, updated 2026-09-02.** This file reconciles the original `AI_Business_OS_Phase_3_Master_Blueprint.docx` with verified repository evidence. It is a planning aid; the architecture, decision log, roadmap, status, and runbook remain the durable operational sources of truth. A planned milestone is not authority to implement it.

## How to use this record

- Treat the original blueprint as the product direction, not an executable instruction set or a claim that every listed capability already exists.
- Treat a repository feature as complete only where code, schema, tests, and—when required—staging acceptance support it.
- Preserve the established boundary: RogerOS is the authoritative control plane; Hermes is an execution runtime.
- Keep all future work generic and project-scoped. Dogfood projects are test fixtures, never product behavior.

## Verified completed work through M16

| Area | Verified state | Evidence |
| --- | --- | --- |
| Tenancy and shell | Complete foundation: organizations, project memberships, server-resolved project context, isolation tests, project switcher, and RogerOS shell. | M1 commits `6e5604f`, `bdf388c`, `9ca70c3`; `project-context` and `core-project-isolation` tests. |
| Team and work | Complete foundation: project-scoped conversations, threads, Tasks, assignments, dependencies, activity, and audit. | M4–M6 commits `7f7cc39`, `b1ba6cf`, `46be535`; Team/Task tests. |
| Project Brain and governance | Complete foundation: constitution, knowledge, decisions, memory, SOPs, policies, approvals, audit, Tools, and explicit employee Tool permissions. | M7–M10 commits `caf75cd`, `ab2ecc6`, `40a7da3`, `a761ee9`; governance and approval tests. |
| Runtime and connections | Complete controlled foundation: project-scoped Hermes assignments/executions, governed connection execution, and scoped Google Drive. | M11–M13 commits `134140b`, `d2efffb`, `6cacf39`; runtime, connection, and Drive tests. |
| Workforce and skills | Complete controlled foundation: employee assignments, Hermes bot profiles/chat/reconciliation, governed Skill catalog, assignment, provisioning, removal, and isolation. | M14B/M15 commits `d79fc85`, `192032d`, `e1cbde3`; bot-workforce and skills tests. |
| Reliable AI work lifecycle | Complete and accepted in staging: dispatch, signed terminal callback, REVIEW before DONE, revision/retry, role controls, audit/activity evidence, and replay/conflict handling. | M16 commits `e93826d`, `7685721`; full serial suite 23/23; real `ROGEROS_M16_WORK_REVIEW_OK` acceptance. |

## Blueprint reconciliation

### Phase 3A — Foundation

The blueprint's Phase 3A is substantially complete at the foundation level: multi-project tenancy, project switcher, threads, Tasks, Workforce, initial Project Brain, governance, permissions, approvals, audit, migrations, and safe staging flow are present.

Some blueprint ambitions remain deliberately narrower than their final form: Task calendar/timeline views, advanced feature flags, and full configuration versioning/rollback are not claimed complete. That is intentional scope control, not a reason to redesign the completed foundations.

### Phase 3B — Capability and Marketplace

| Blueprint capability | Reconciled state | Planning consequence |
| --- | --- | --- |
| Employee Market | Missing. Workforce has a basic Owner/Admin custom-employee form, but no curated browse-and-hire catalog, template provenance, or safe bundle flow. The current custom-employee API resolves project membership but does not independently enforce the stronger management role shown by the UI. | Proposed M17, including server-side hiring authority for both the existing and new flows. |
| Skill Library / Skill Market | Partly complete. A trusted global Skill catalog, project assignment, provisioning, and removal exist. User-upload, benchmarks, rollback/version history, and Coach proposals do not. | Keep M15 intact; defer broader marketplace publishing and Coach work. |
| App / Tool / MCP Market | Foundation only. Tool definitions, capabilities, permissions, governed execution, and one Drive connection exist; there is no generalized market or manifest-driven installation experience. | Proposed after M17. |
| Connections and credential abstraction | Partly complete. Project Connections, encrypted Drive credentials/scopes, connection health, and governed execution exist. General OAuth providers, connection lifecycle breadth, and a simple install journey remain. | Continue after the App/Tool Market foundation. |
| App Workspaces | Missing as a framework. Hermes has controlled Workforce/runtime views, but there is no generic connected-app operational workspace system. | Build only after a market/manifest boundary exists. |
| Google Drive | Complete first reference integration for scoped Brain sources and governed reads, not a claim of universal file storage. | Preserve as the reference pattern. |
| Agent Coach | Missing. | Do not start before workforce outcomes/scorecards and safe recommendation/approval boundaries are designed. |
| Scorecards and cost tracking | Missing as a RogerOS product module. Legacy upstream routes are not proof of project-scoped scorecards or cost governance. | Build before or together with a narrowly scoped Coach foundation. |
| Global command/search | Navigation-only command palette exists; project-wide search and business commands do not. | Defer until searchable, project-scoped indexes and permission rules are specified. |

### Phase 3C — Advanced Workplace

Meetings, Business Reporter, Virtual Browser, human takeover, Teach Mode, advanced Project Brain visualization, Goals/OKRs, and Portfolio Mode are still planned. None should be inferred from legacy upstream routes or started merely because their names appear in the blueprint. Browser, takeover, and Portfolio Mode have especially high credential, isolation, and audit risk.

### Phase 3D — SaaS productization

Blank customer onboarding, templates/bundles, billing, production OAuth verification, deletion/export, support tooling, disaster recovery, and the managed-versus-bring-your-own Hermes decision remain future productization work. They must follow—not bypass—the remaining governed capability work and a fresh owner approval. Production readiness is not implied by staging acceptance.

## Proposed dependency-ordered remaining sequence

This is a recommendation for planning, not an approved implementation schedule.

1. **M17 — Employee Market and Safe Hiring.** Establish the curated employee-template and governed hiring boundary on top of the completed Workforce, Skills, Tools, Runtime, and M16 lifecycle foundations.
2. **M18 — App/Tool/MCP Market and connection lifecycle.** Generalize the existing Tool/Connection patterns into curated, manifest-backed installations without exposing credentials to employees. Installation lifecycle and health must be server-authorized, idempotent, and unable to claim provider connectivity without a typed connection flow.
3. **M19 — Connected App Workspaces.** Add a generic human-facing workspace framework only for installed, healthy, project-authorized applications; begin with one reference app.
4. **M20 — Workforce scorecards and cost evidence.** Produce project-scoped, auditable outcome/cost facts before allowing automatic workforce-improvement recommendations.
5. **M21 — Agent Coach recommendations.** Make Coach outputs reviewable proposals for Skills, policy, Soul, or permission changes; no silent mutation.
6. **M22 — Project-wide search and command.** Search only authorized project resources and create work only through existing governed workflows.
7. **Phase 3C planning gates.** Select one advanced workplace vertical slice at a time. Meetings and Reporter can be planned before browser automation; Virtual Browser, takeover, and Teach Mode require a separate security design and VPS workstream.
8. **Phase 3D productization gate.** Plan customer onboarding, templates/bundles, billing, operational controls, and production promotion only after an explicit tenant-isolation and production-readiness review.

The ordering protects the blueprint's core principle: configure reusable capabilities first, observe their outcomes, then add increasingly autonomous or credential-sensitive features.

## M18 Part 1 — App/Tool/MCP Market data foundation

Part 1 establishes only the data and server-side control boundary: curated versioned non-secret manifests, project-owned installation provenance, explicit lifecycle states, and OWNER/ADMIN-only installation and lifecycle mutation. Each installation links to the existing `ProjectTool`; existing `ProjectConnection`, encrypted credential, scoped access, policy, approval, execution, and audit pathways remain authoritative. Installation is default-deny and creates no employee permission, connection credential/scope, policy exception, or execution adapter. UI, OAuth/provider expansion, staging migration, Preview deployment, and Hermes/VPS work are explicitly out of scope.

## Proposed M17 — Employee Market and Safe Hiring

### Goal

Let an authorized project owner browse a small, curated catalog of reusable AI employee roles and hire one safely into a project. Hiring must create a project-owned employment record and must never grant credentials, cross-project context, or unapproved external power.

### In scope

- A curated, versioned employee-template catalog with generic role, description, Soul summary, supported Skills, recommended Tools, and KPI-template metadata.
- A dedicated Market experience that clearly separates browsing templates from the existing Workforce management screen.
- OWNER and ADMIN hiring flow that creates a project-scoped employment assignment and records template/version provenance. The existing custom-employee mutation must receive the same server-side role enforcement; UI visibility alone is not authority.
- Explicit, reviewable selection of supported Skills and recommended Tool permissions. A recommendation is not a grant.
- Optional connection to an already approved Hermes runtime through the existing typed assignment/reconciliation flow; no new runtime transport or VPS change.
- Pause, resume, and retirement behavior that preserves Tasks, executions, review evidence, activity, and audit history.
- Server-side authorization, project isolation, safe errors, audit events, activity records, and focused automated tests.

### Out of scope

- Public/community marketplace submissions, arbitrary template uploads, paid listings, employee bundles, billing, onboarding, and production promotion.
- Automatic granting of Tools, connections, credentials, or high-risk Skills.
- New Hermes adapter behavior, VPS changes, browser automation, Agent Coach, scorecards, or a generalized App Market.
- Deleting protected system employees or rewriting the completed M1–M16 lifecycle.

### Data and migration boundary

- Perform a schema design review before implementation. Prefer a dedicated immutable employee-template/version model with explicit Skill and Tool recommendations.
- Preserve the distinction between a reusable Employee definition and an `EmployeeProjectAssignment` that is authoritative for project membership. Do not turn a mutable global Employee row into a cross-project configuration channel.
- Store template key/version and a safe configuration snapshot or provenance on the project-owned hire record so later catalog changes cannot silently change an already hired employee.
- Use an additive, reviewed migration only if new durable records are needed. No production migration is authorized.

### Authorization and security boundary

- OWNER and ADMIN may browse and hire. The implementation must enforce this on the server for both market hiring and the existing custom-employee mutation; VIEWER remains read-only. Decide exact pause/retire authority during the specification review.
- Every route derives project context server-side and uses project-scoped composite lookups. Template identity never authorizes access to another project.
- Templates contain no credentials, endpoints, prompts that override policy, or raw runtime configuration.
- Skills remain subject to M15 trust, allowlist, assignment, reconciliation, and explicit removal rules. Tools remain subject to project connection, permission, policy, and approval rules.
- A hired employee cannot receive a Hermes runtime profile until the existing controlled runtime assignment checks succeed.

### Acceptance gates

1. Automated tests prove template catalog access, server-side denial of unauthorized custom and market hiring, project isolation, repeated-hire handling, safe pause/retire behavior, audit/activity records, and denial of unapproved capability grants.
2. Schema validation, focused lint, TypeScript, production build, relevant M2/M5/M11/M15/M16 regressions, and the full serial suite pass.
3. The exact migration is reviewed for additive behavior and applied only to verified staging after an explicit staging decision.
4. A non-`main` `phase-3` Preview from the exact implementation commit is Ready and the canonical staging alias points to it.
5. In normal Preview UI, an authorized owner hires one curated employee, explicitly grants only allowed Skills/Tool permissions, and—if runtime assignment is included—uses the existing controlled reconciliation path.
6. The hired employee completes a real Task through the M16 `IN_PROGRESS` → `REVIEW` → authorized acceptance → `DONE` lifecycle, with activity/audit evidence.
7. A second staging project cannot view, alter, assign, or execute the first project's hired employee or its records. Unauthorized roles cannot hire or mutate it.
8. Browser verification and final code/security review pass. The branch is clean and synchronized before closeout.

### Rollback and stop condition

Use an additive migration and a scoped feature path so the existing Workforce continues to work. If a staging migration, authorization, isolation, runtime reconciliation, or Preview acceptance fails, stop and preserve the evidence; do not use production or direct database mutation as a workaround.

Stop M17 after its approved staging closeout. Do not start M18 or any Phase 3C/3D item without a new owner approval.

## Owner decision required

This plan recommends M17: Employee Market and Safe Hiring because it is the first missing Phase 3B capability that can safely build on the completed Workforce, Skills, Tools, Runtime, and M16 review lifecycle. It is **proposed, not approved**. Before implementation, the owner must approve or revise the M17 goal, catalog model, hire authority, and acceptance gates.
