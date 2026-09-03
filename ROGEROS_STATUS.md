# RogerOS status

> **ROGEROS_STATUS.md is a handoff aid, not the source of truth. Always verify git status, recent commits, migrations, tests, and relevant code before working.**

Last updated: 2026-09-02

## Current state

- Authoritative development branch: `phase-3`.
- Meaningful M15 baseline: `3d82601724e8cb567578649e1c829478a0d64d7c` (`fix: report only active governed skills`).
- Current session: M17 Employee Market and Safe Hiring is implemented locally on top of `origin/phase-3` head `e6ed1d14b4e543662f10fe53bf18ae0944529b95`. Prisma validation/generation, TypeScript, focused lint, migration diff review, and production build passed; it awaits verified staging migration/test/Preview acceptance. M16 remains complete and accepted in staging.
- M15 is fully closed. Real Preview acceptance assigned `1-3-1 Communication`, reconciled it to the Vhalam Chief runtime, persisted `ROGEROS_M15_SKILL_OK`, audited the lifecycle, removed the assignment, and observed zero active governed skills afterward.
- Stable phase-3 Preview: `https://hermes-agent-missio-git-a9eea4-greenpixxelagency-2153s-projects.vercel.app`.
- Staging schema: all 21 repository migrations through `20260828120000_add_reliable_ai_work_review` reported applied on 2026-08-28. New additive migration `20260903090000_add_employee_market_safe_hiring` has not been applied.

## Completed product foundations

- M1–M3: generic organization/project tenancy, persistent authentication/project context, core isolation, RogerOS shell and project switcher.
- M4–M6: project-scoped Team/Threads, Tasks, and Workforce.
- M7–M10: Project Brain, SOP/policy governance, Tools/employee permissions, approvals, and audit.
- M11–M13: Hermes runtime execution, governed connections/tool execution, and scoped Google Drive Brain sources.
- M14B: Hermes bot/profile workforce reconciliation and chat.
- M15: governed Skill catalog, employee assignment, typed provisioning, reconciliation, execution acceptance, audit, removal, and isolation.
- M16: reliable Hermes execution completion, safe retry/revision, signed callbacks, human review, activity/audit evidence, and deployed end-to-end acceptance.

## Known limitations and risks

- Only `one-three-one-rule` is currently allowlisted for Hermes provisioning. Expanding the catalog requires explicit security review and runtime acceptance.
- The current custom-employee API resolves project membership but does not independently enforce the stronger Owner/Admin management role used by the Workforce UI. M17 must add server-side hiring authority and regression coverage before a Market or hiring flow is accepted.
- Dogfood seed scripts intentionally name Green Pixxel, Vhalam, and Buddhaji; they must stay staging-only and must never be imported into product behavior.
- Upstream legacy Hermy HQ routes still coexist with `/p/[projectSlug]`; avoid accidental cross-system refactors.
- Local dependency resolution uses a linked `node_modules`, and Next.js reports multiple lockfiles/workspace-root inference during builds.
- Preview/staging evidence does not authorize production migration or deployment. Production and `main` remain protected unless explicitly approved.

## Current stop point

- M16 is closed. The Phase 3 blueprint reconciliation and proposed dependency plan are recorded in `ROGEROS_PHASE_3_PLAN.md`.
- M17 implementation is complete locally but is not closed: apply only the reviewed additive migration to a verified staging database, run focused database/regression tests, deploy a non-main Preview, and complete normal UI/isolation acceptance before any closeout.
- Current local Vercel CLI identity is `buddhajicare-4495`, whose only listed team has no projects; it cannot access the documented Green Pixxel staging project. Do not link or deploy from this identity as a workaround.
- Production and `main` remain protected and untouched.

## M16 closeout evidence

### Product lifecycle

- `HermesExecution` remains a project-owned execution attempt attached to the authoritative RogerOS Task; no duplicate work system was introduced.
- Dispatch moves the Task to `IN_PROGRESS`. The latest valid success moves it to `REVIEW`. Only OWNER, ADMIN, or APPROVER acceptance moves it to `DONE`; revision returns it to `TODO`; failure moves it to `BLOCKED` for explicit retry.
- OWNER, ADMIN, and OPERATOR may dispatch, retry, and reconcile runtime state. OWNER, ADMIN, and APPROVER may review. VIEWER is read-only.
- Duplicate active dispatch, stale attempts, terminal mutation, callback replay/conflict, unsafe upstream errors, transaction conflicts, and cross-project access are handled safely and audited.

### Isolated staging adapter

- The dedicated VPS workstream installed and authenticated Vercel CLI as Green Pixxel and targeted only `greenpixxelagency-2153s-projects/hermes-agent-mission-control`.
- `ROGEROS_HERMES_CALLBACK_SECRET` is configured as a sensitive Preview-only Vercel variable and was verified absent from Production. Its value was not exposed in the handoff.
- The isolated staging adapter has a protected callback URL and matching callback secret in its mode-`0600` environment file.
- `/opt/rogeros-hermes-staging/adapter/server.mjs` delivers durable HMAC-SHA256 signed terminal callbacks with timestamp/signature headers, restricted payload fields, 20,000-character output limit, safe redaction, persistent delivery state, three fixed retries, timeout, and redirect rejection. It accepts existing UUID execution IDs and strict Prisma/RogerOS CUIDs.
- Vercel Deployment Protection is crossed with one project-scoped automation bypass credential stored only in the protected staging adapter environment and sent only to the fixed Preview callback URL. This credential is not literally Preview-scoped, so its storage, destination, and rotation remain security-sensitive.
- Existing bearer authorization, fixed staging identity/Compose target, identity validation, and no-tool Hermes execution remain unchanged.
- Only `rogeros-hermes-staging-adapter.service` was restarted. Health is good and staging identity remains `rogeros-vhalam-chief-of-staff`.
- Production Hermes was not modified and remains running.

### Staging database

- Verified the target as the established RogerOS staging Neon endpoint before migration.
- Reviewed and applied only `20260828120000_add_reliable_ai_work_review` to staging.
- Prisma reported all 21 migrations applied and the staging schema up to date.
- The migration is additive except for replacing the obsolete `HermesExecution(taskId,status)` unique index with normal lifecycle indexes; it does not drop tables, truncate data, weaken tenancy, or alter production.

### Verification completed

- Full serial M1–M16 regression suite passed: 23/23.
- TypeScript, focused lint, Prisma validation, diff whitespace check, and the production build passed.
- Security Review found two medium issues: VIEWER could initiate refresh reconciliation, and callback input was buffered before its size check. Both were fixed in `7685721c61bc06204343d260555079c18f402e98`; focused lifecycle tests passed 3/3 afterward.
- Verified hardened Preview deployment `5xRYtipN43f6qsgm7uPrtQJgwmQn` is Ready from `phase-3` commit `7685721c61bc06204343d260555079c18f402e98`; immutable URL is `https://hermes-agent-mission-control-c4p0hxksx.vercel.app` and the canonical staging alias points to it.
- Real acceptance Task `cmtiilzjy0005jm04tiipb1yz` received `ROGEROS_M16_WORK_REVIEW_OK`, entered `REVIEW`, and moved to `DONE` only after authorized Owner acceptance. Execution `cmtiin3cv000fjm04zmm1b2rx` persisted success, callback fingerprint/timestamp, accepted review evidence, TaskActivity records, and AuditEvents.
- Exact callback replay was idempotent and returned HTTP 200 without rerunning Hermes or changing the stored result. Failure/retry/conflict/role/isolation coverage passed; foreign-project matches were zero.
- Browser verification showed the accepted Task as Completed with the exact result marker and review-acceptance activity.

### Current Git and deployment state

- Authoritative worktree: `C:\Users\Samsung\.codex\visualizations\2026\08\14\019fff37-50d8-7573-83ee-f144a7eec709\hermes-m9`.
- Branch: `phase-3`.
- M16 application commit: `e93826de0b4217e4a111f51dfec0af2fb1713f95`.
- M16 security hardening commit: `7685721c61bc06204343d260555079c18f402e98`.
- Both commits are pushed to `origin/phase-3`; the closeout documentation follows them.
- Production and `main` remain untouched. No post-M16 work has started.

## Warnings for a future approved milestone

- Identify the authoritative worktree before editing; the Documents checkout may be stale.
- Re-read the six RogerOS documents, then verify Git/code/migrations/tests yourself.
- Do not recreate completed M1–M16 systems or hardcode dogfood projects.
- Do not touch production, `main`, production Hermes/bridge, or production data without explicit authorization.
- For any Hermes or VPS operation, first provide the owner a self-contained prompt for the dedicated Hermes VPS Codex task, then continue from its returned handoff. Do not silently combine repository and VPS mutations.
- Read-only VPS inspection found the unrelated production `hermyhq-bridge.service` already in an auto-restart failure loop. It was not touched. Do not fold investigation or repair of that service into M16 without a separate owner-approved VPS prompt.
