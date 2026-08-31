# RogerOS status

> **ROGEROS_STATUS.md is a handoff aid, not the source of truth. Always verify git status, recent commits, migrations, tests, and relevant code before working.**

Last updated: 2026-08-31

## Current state

- Authoritative development branch: `phase-3`.
- Meaningful M15 baseline: `3d82601724e8cb567578649e1c829478a0d64d7c` (`fix: report only active governed skills`).
- Current session: M16 Reliable AI Work Lifecycle + Human Review is implemented locally, its additive migration is applied to verified staging, and the isolated staging adapter callback work is deployed and healthy. The repository work is uncommitted; a verified `phase-3` Preview deployment and real runtime acceptance are still pending.
- M15 is fully closed. Real Preview acceptance assigned `1-3-1 Communication`, reconciled it to the Vhalam Chief runtime, persisted `ROGEROS_M15_SKILL_OK`, audited the lifecycle, removed the assignment, and observed zero active governed skills afterward.
- Stable phase-3 Preview: `https://hermes-agent-missio-git-a9eea4-greenpixxelagency-2153s-projects.vercel.app`.
- Staging schema: all 21 repository migrations through `20260828120000_add_reliable_ai_work_review` reported applied on 2026-08-28.

## Completed product foundations

- M1–M3: generic organization/project tenancy, persistent authentication/project context, core isolation, RogerOS shell and project switcher.
- M4–M6: project-scoped Team/Threads, Tasks, and Workforce.
- M7–M10: Project Brain, SOP/policy governance, Tools/employee permissions, approvals, and audit.
- M11–M13: Hermes runtime execution, governed connections/tool execution, and scoped Google Drive Brain sources.
- M14B: Hermes bot/profile workforce reconciliation and chat.
- M15: governed Skill catalog, employee assignment, typed provisioning, reconciliation, execution acceptance, audit, removal, and isolation.

## Known limitations and risks

- Only `one-three-one-rule` is currently allowlisted for Hermes provisioning. Expanding the catalog requires explicit security review and runtime acceptance.
- Dogfood seed scripts intentionally name Green Pixxel, Vhalam, and Buddhaji; they must stay staging-only and must never be imported into product behavior.
- Upstream legacy Hermy HQ routes still coexist with `/p/[projectSlug]`; avoid accidental cross-system refactors.
- Local dependency resolution uses a linked `node_modules`, and Next.js reports multiple lockfiles/workspace-root inference during builds.
- Preview/staging evidence does not authorize production migration or deployment. Production and `main` remain protected unless explicitly approved.

## Unfinished and next work

- Complete M16 from the existing uncommitted authoritative worktree. Do not restart or redesign it.
- No post-M16 milestone is approved.

## M16 implementation handoff

### Done locally

- Added project-owned human-review state and callback evidence to `HermesExecution` without creating a second Task or work-run system.
- Implemented the authoritative lifecycle: dispatch moves Task to `IN_PROGRESS`; latest valid Hermes success moves it to `REVIEW`; only OWNER, ADMIN, or APPROVER acceptance moves it to `DONE`; revision returns it to `TODO`; failure moves it to `BLOCKED` for explicit retry.
- Enforced dispatch/retry for OWNER, ADMIN, and OPERATOR; review for OWNER, ADMIN, and APPROVER; VIEWER remains read-only.
- Added duplicate-active-dispatch protection, latest-attempt protection, immutable terminal/review behavior, safe failure normalization, bounded Serializable-transaction retry, and project-scoped lookups.
- Added timestamped HMAC completion-callback verification with strict payload shape, size limit, replay window, idempotency fingerprint, conflict rejection, and project derivation from the stored external execution ID.
- Added review and retry API routes, middleware handling for the signed callback, business-language Task execution/review UI, active execution polling, TaskActivity records, and AuditEvents.
- Added `tests/work-lifecycle.test.ts`, updated affected M11/M2 regressions, and documented the M16 architecture, decisions, roadmap, and callback-secret runbook boundary.
- The local temporary `.m16-adapter-server.mjs` was the review artifact for the now-deployed staging adapter patch. It is not product source, is no longer needed for deployment, and must be removed before committing.

### Isolated staging adapter

- The dedicated VPS workstream installed and authenticated Vercel CLI as Green Pixxel and targeted only `greenpixxelagency-2153s-projects/hermes-agent-mission-control`.
- `ROGEROS_HERMES_CALLBACK_SECRET` is configured as a sensitive Preview-only Vercel variable and was verified absent from Production. Its value was not exposed in the handoff.
- The isolated staging adapter has a protected callback URL and matching callback secret in its mode-`0600` environment file.
- `/opt/rogeros-hermes-staging/adapter/server.mjs` now delivers durable HMAC-SHA256 signed terminal callbacks with timestamp/signature headers, restricted payload fields, 20,000-character output limit, safe redaction, persistent delivery state, three fixed retries, timeout, and redirect rejection.
- Existing bearer authorization, fixed staging identity/Compose target, identity validation, and no-tool Hermes execution remain unchanged.
- Only `rogeros-hermes-staging-adapter.service` was restarted. Health is good and staging identity remains `rogeros-vhalam-chief-of-staff`.
- Production Hermes was not modified and remains running.

### Staging database

- Verified the target as the established RogerOS staging Neon endpoint before migration.
- Reviewed and applied only `20260828120000_add_reliable_ai_work_review` to staging.
- Prisma reported all 21 migrations applied and the staging schema up to date.
- The migration is additive except for replacing the obsolete `HermesExecution(taskId,status)` unique index with normal lifecycle indexes; it does not drop tables, truncate data, weaken tenancy, or alter production.

### Verification completed

- Prisma schema validation passed.
- Prisma client generation and TypeScript passed.
- Targeted lint passed with zero errors; Prisma schema produced only the expected ignored-file warning.
- Dedicated M16 callback-security and database lifecycle suite passed: 2/2.
- Targeted M2, M5, and M11 regressions passed: 3/3.
- A parallel full regression run passed 21/22; its only failure was a transient Prisma `P2034` Serializable write conflict in M11. The lifecycle service was hardened with Prisma's bounded retry pattern afterward.
- The subsequent serial full-suite rerun began successfully, but the local command host closed its output before a complete result was captured. A new task must rerun the full suite conclusively.

### Still required for M16 completion

1. Re-run the complete M1–M16 regression suite serially and capture the final result.
2. Run final TypeScript, targeted lint, Prisma validate/generate/status, and the production build.
3. Review the exact application diff and remove `.m16-adapter-server.mjs`; ensure it is excluded from the Git commit.
4. Commit and push the scoped M16 repository changes to `phase-3`.
5. Verify Vercel creates a non-`main` Preview deployment from that exact commit and that the canonical staging alias resolves to it. The new Preview environment variable is not considered active until this deployment is verified.
6. Through normal deployed RogerOS flows, create/dispatch the authoritative staging acceptance Task, prove real signed callback output contains `ROGEROS_M16_WORK_REVIEW_OK`, confirm Task is `REVIEW`, persist execution/activity/audit/callback evidence, accept it as an authorized human, and confirm Task becomes `DONE`.
7. Prove safe failure/retry, callback replay/conflict handling, role restrictions, Vhalam/Buddhaji isolation, and no unrelated project/runtime state changes.
8. Perform browser visual verification, final code/security review, update this file with immutable deployment evidence, and leave `phase-3` clean and synchronized.

### Current Git and deployment state

- Authoritative worktree: `C:\Users\Samsung\.codex\visualizations\2026\08\14\019fff37-50d8-7573-83ee-f144a7eec709\hermes-m9`.
- Branch: `phase-3`.
- Committed baseline remains `16f6f5d148cda5b571f962db3dd4c7f6861de74b`; current M16 changes are not committed or pushed.
- The current Preview therefore does not yet contain M16.
- A pre-existing Preview deployment was deliberately not redeployed by the VPS workstream because its metadata did not prove a non-`main` source branch. This was the correct production-safe stop; the repository workstream must create and verify the next `phase-3` Preview from the M16 commit.
- Production and `main` remain untouched. No post-M16 work has started.

## Warnings for the next agent

- Identify the authoritative worktree before editing; the Documents checkout may be stale.
- Re-read the six RogerOS documents, then verify Git/code/migrations/tests yourself.
- Do not recreate completed M1–M15 systems or hardcode dogfood projects.
- Do not touch production, `main`, production Hermes/bridge, or production data without explicit authorization.
- For any Hermes or VPS operation, first provide the owner a self-contained prompt for the dedicated Hermes VPS Codex task, then continue from its returned handoff. Do not silently combine repository and VPS mutations.
- Read-only VPS inspection found the unrelated production `hermyhq-bridge.service` already in an auto-restart failure loop. It was not touched. Do not fold investigation or repair of that service into M16 without a separate owner-approved VPS prompt.
