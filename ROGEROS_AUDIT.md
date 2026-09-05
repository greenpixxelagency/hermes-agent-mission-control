# RogerOS audit — 2026-09-05

## What was audited

This is an evidence snapshot, not a new product commitment. The audit used the clean authoritative local history at `0e084d5` on `codex/m18-localhost`, which fast-forwarded into this audit branch. It inspected the 24 Prisma migrations, the RogerOS schema and `/p/[projectSlug]` routes, control-plane services, and focused tests. The isolated local configuration validated the schema; the authoritative checkout passed TypeScript and the focused App Market (3/3), permission (4/4), and approval (3/3) tests. Earlier M18 closeout evidence records full local/staging suites (27/27), build/lint, Preview acceptance, and local real Google Drive consent/health acceptance. No production, staging, provider, database, or VPS operation was performed for this audit.

## What works now

- **Accounts and workspaces:** signed-in users resolve through Organization and Project membership on the server. The project switcher and project shell work under `/p/[projectSlug]`; inaccessible projects deliberately look missing.
- **Work and people:** Team conversations/threads, Tasks, assignments, activity, a project workforce, custom hires, curated Employee Market hires, pause/resume/retire employment, Hermes bot profiles, reconciliation, and chat have code, schema, and focused coverage.
- **AI task safety:** a task is RogerOS-owned. Authorized dispatch creates a Hermes attempt; success stops at human review, review can accept or request revision, failure is safely retryable, and signed completion callbacks are bounded, authenticated, replay-aware, and audited.
- **Knowledge and governance:** each project has a constitution, knowledge, decisions, memory, source provenance, SOP/policy records, tool permissions, approval decisions, and audit events. Google Drive is a read-only reference integration with encrypted credentials and explicit project file/folder scope.
- **Capabilities:** trusted Skills are explicitly assigned/reconciled per employee. The App Market has versioned manifests, idempotent Owner/Admin lifecycle actions, connection-state checks, health checks, execution re-checks, and a live locally accepted Google Drive connection. Installation itself grants nothing.

## Partial, planned, or legacy areas

- **Partial UI coverage:** Brain supports create/read/search but not a full editing, deletion, lifecycle, or source-management workflow. SOPs/policies and audit are represented in API/data models but are not a complete dedicated operating workspace. Task, Team, Workforce, Tools, and Market have functional focused views, not a finished enterprise UX.
- **Planned shell pages:** `/reports`, `/automations`, and `/settings` intentionally render “Foundation” cards only. The command palette is navigation-only; it is not project-wide search or a command executor.
- **Narrow integration catalog:** only Google Drive has a typed real connection lifecycle; only `one-three-one-rule` is allowlisted for Hermes Skill provisioning. Drive file/folder selection and employee grants are deliberate manual configuration.
- **Legacy upstream product:** many root-level Hermy HQ routes, APIs, schema models, bridge files, and the historical README/ONBOARDING flow remain. They are not project-scoped RogerOS evidence and must not be mixed with RogerOS work without a separate migration/retirement decision.

## Risks and remaining validation

| Severity | Finding | Evidence and consequence |
| --- | --- | --- |
| High | Production/customer readiness is not established. | Only local, staging, and Preview acceptance are recorded; production migrations, OAuth, deployment, onboarding, billing, deletion/export, support, and disaster recovery are not approved or verified. |
| High | Legacy and RogerOS systems coexist in one repository. | The root README describes Hermy HQ while `/p/[projectSlug]` is RogerOS; legacy models/routes still share the schema. Route or schema changes can accidentally cross boundaries. |
| Medium | The migration chain cannot bootstrap a blank database with `migrate deploy`. | The local runbook documents an older connection migration ordering dependency on a later `ProjectTool` migration. Local development uses `db push`; a production-grade bootstrap/repair plan needs an owner-approved migration design. |
| Medium | App Market lifecycle races have not been stress-tested against a real concurrent database workload. | M18 closeout has static/security and normal acceptance evidence, but records concurrent database race testing as unexercised. |
| Medium | There is no completed generic app workspace, scorecard/cost model, Coach, or project-wide search. | The shell and Phase 3 plan explicitly mark these future work. Do not interpret labels as shipped functionality. |
| Low | This audit worktree lacks a usable local dependency installation. | The task checkout could validate Prisma only when supplied the authoritative gitignored local environment and could not resolve its own `tsx`/TypeScript dependencies. This is a reproducibility/worktree setup issue, not proof that product code fails. |

## Recommended next milestone: M19 — Connected App Workspaces

Build one small, human-facing workspace for an installed, healthy, project-authorized app—start with Google Drive. It uses the completed Market/Connection boundary, produces useful customer-visible value, and avoids prematurely adding automation or autonomous changes.

**Scope:** a project-scoped Drive workspace that lists only explicitly granted sources, shows connection/health state and provenance, lets Owner/Admin manage scopes through the existing governed route, and lets authorized users browse/read supported content through existing permission and policy checks. Do not add write access, employee auto-grants, new provider adapters, generic app execution, Hermes/VPS changes, or production work.

**Acceptance:** server-side project/role checks and isolation tests; disabled/uninstalled/expired-credential denial; no raw credential in API/UI/audit; normal browser proof for an Owner and denial proof for another project/role; migration review only if new durable records are essential; focused tests plus nearby M10/M12/M13/M18 regressions, TypeScript, lint, build, and isolated local/Preview acceptance.

**Stop:** stop on any tenancy, scope, credential, policy, migration, or provider-health failure; preserve evidence and do not work around it with direct database/provider mutations. Any Hermes/VPS requirement requires the separate handoff prompt in `ROGEROS_RUNBOOK.md`; M19 should not need one.
