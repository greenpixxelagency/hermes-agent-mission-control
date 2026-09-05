# RogerOS status

> **ROGEROS_STATUS.md is a handoff aid, not the source of truth. Always verify git status, recent commits, migrations, tests, and relevant code before working.**

Last updated: 2026-09-05

## Current state

- Authoritative development branch: `phase-3`.
- Meaningful M15 baseline: `3d82601724e8cb567578649e1c829478a0d64d7c` (`fix: report only active governed skills`).
- Current session: M18 Parts 1–3 are implemented and closed on the verified Part 1/Part 2 ancestry. Local TypeScript, Prisma generation/validation, targeted M18 UI lint, focused rules/authority tests, production build, full 27/27 suite, and authenticated localhost acceptance pass. Verified staging migration, serial 27/27 staging regression, and authenticated Preview acceptance also pass.
- M15 is fully closed. Real Preview acceptance assigned `1-3-1 Communication`, reconciled it to the Vhalam Chief runtime, persisted `ROGEROS_M15_SKILL_OK`, audited the lifecycle, removed the assignment, and observed zero active governed skills afterward.
- Stable phase-3 Preview: `https://hermes-agent-missio-git-a9eea4-greenpixxelagency-2153s-projects.vercel.app`.
- Staging schema: all 24 repository migrations through `20260905093000_harden_app_market_lifecycle` are applied.
- M18 is complete: curated manifests, project-scoped installation provenance, idempotent lifecycle APIs, typed connection-state synchronization, health checks, execution re-checks, and the human-facing App Market/connection lifecycle UI are migrated and accepted in staging/Preview.

## Completed product foundations

- M1–M3: generic organization/project tenancy, persistent authentication/project context, core isolation, RogerOS shell and project switcher.
- M4–M6: project-scoped Team/Threads, Tasks, and Workforce.
- M7–M10: Project Brain, SOP/policy governance, Tools/employee permissions, approvals, and audit.
- M11–M13: Hermes runtime execution, governed connections/tool execution, and scoped Google Drive Brain sources.
- M14B: Hermes bot/profile workforce reconciliation and chat.
- M15: governed Skill catalog, employee assignment, typed provisioning, reconciliation, execution acceptance, audit, removal, and isolation.
- M16: reliable Hermes execution completion, safe retry/revision, signed callbacks, human review, activity/audit evidence, and deployed end-to-end acceptance.
- M17: curated versioned Employee Market, project-owned hiring provenance, Owner/Admin authority, default-deny capability recommendations, and pause/resume/retire employment lifecycle.

## Known limitations and risks

- Only `one-three-one-rule` is currently allowlisted for Hermes provisioning. Expanding the catalog requires explicit security review and runtime acceptance.
- Dogfood seed scripts intentionally name Green Pixxel, Vhalam, and Buddhaji; they must stay staging-only and must never be imported into product behavior.
- Upstream legacy Hermy HQ routes still coexist with `/p/[projectSlug]`; avoid accidental cross-system refactors.
- Local dependency resolution uses a linked `node_modules`, and Next.js reports multiple lockfiles/workspace-root inference during builds.
- Preview/staging evidence does not authorize production migration or deployment. Production and `main` remain protected unless explicitly approved.

## Current stop point

- M16 is closed. The Phase 3 blueprint reconciliation and proposed dependency plan are recorded in `ROGEROS_PHASE_3_PLAN.md`.
- M17 is closed. M18 is closed on local branch `codex/m18-localhost` at `6b6351b` (`fix: close M18 security review findings`), pushed to `phase-3` and `codex/m18-localhost`. Its implementation ancestry includes Part 1 `9c7effbdaee0d74a70f70851a87d6a0398e6ac1e`, Part 2 `692416f87756bc0702b31573945bf4fd1a2cf723`, Part 3 `1e7b73da113b13e7975b25d4c9d0fd0d1d76faf2`, UI/config follow-ups `d02a6497205f3a57db918722940ee2ece231a683`, local closeout `ae26801`, and security hardening `6b6351b`. Staging migrations `20260905090000_add_app_tool_mcp_market_foundation` and `20260905093000_harden_app_market_lifecycle` are applied; serial staging regression is 27/27. Final authenticated Preview deployment `dpl_ArrDpH1jJrHSxYbpWJDmtccBWAhR` is Ready at `https://hermes-agent-mission-control-9hvq6njfs.vercel.app` and accepted Market browse/API access, install, HTTP 200 idempotent replay, missing-connection health failure, disable, correct `CONNECTION_REQUIRED` re-enable denial without credentials, uninstall, and lifecycle audit evidence. Temporary acceptance fixtures were removed afterward.
- Current local Vercel CLI identity is `rogeros`, with access to `greenpixxelagency-2153s-projects/hermes-agent-mission-control`.
- Local development profile is available at `http://localhost:3001` with an isolated workspace-local PostgreSQL cluster on port `55432`; `.env.local` and the local database files are gitignored.
- The local database is synchronized with `prisma db push` via `npm run db:local:push`; a clean `prisma migrate deploy` cannot replay the historical migration ordering on an empty database because the older connections migration references `ProjectTool` before its later catalog migration. Migration files and staging history were not changed.
- Local verification is complete: the full repository suite passes 27/27 against the local database, and authenticated localhost acceptance covered App Market install, idempotent replay, missing-connection health failure, disable, and uninstall. Staging/Preview acceptance is complete. Real Google OAuth remains an intentionally unperformed provider-credential flow; production migration/deployment and `main` remain protected.
- Production and `main` remain protected and untouched.

## M17 closeout evidence

- Applied only additive migration `20260903090000_add_employee_market_safe_hiring` to the verified `phase-3` Preview database; Prisma reported all 22 migrations applied.
- Focused staging test passed 1/1, covering Owner/Admin authority, Operator/Viewer denial, project isolation, idempotent hiring, default-deny Skills/Tools/runtime access, safe audit data, and pause/resume/retire lifecycle.
- Test cleanup now removes version rows before their parent template and clears only `operations-m17-*` test fixtures left by interrupted runs.
- Verified Preview deployment `dpl_HRiPUkf4ggdg4NoknhPyVz5Vk7MP` is Ready at `https://hermes-agent-mission-control-ob7xfpp82.vercel.app`.
- M17 application commit is `49c8f3a7cfe017838cbd814ba3821160c54422e4`; closeout fixes and evidence are pushed only to `phase-3`.
- No capability, credential, connection, Tool, Skill, or Hermes runtime access is auto-granted by hiring. Production and `main` were not touched.

## M18 closeout evidence

- Local follow-up: real Google sign-in completed and authenticated Owner access to `/p/local` was verified. Fixed the App Market catalog to offer reinstall for an uninstalled app using the existing authorized install API. Browser acceptance reinstalled Drive successfully; TypeScript, scoped ESLint, and 3/3 app-market rules tests passed. Started the separate Drive OAuth flow and reached Google's account chooser requesting `drive.readonly`; Drive consent, token exchange, health, and explicit file/folder selection remain pending.

- Local OAuth setup follow-up (2026-09-05): added localhost:3001 sign-in and Drive callback URIs to the existing RogerOS Drive Preview client, preserving its Preview callback. Added a new secret without disabling the existing secret and configured it only in gitignored `.env.local`. The local owner email is allowlisted and seeded. Restarted the isolated local database and app; Google sign-in now reaches the account chooser instead of `invalid_client`. User sign-in/consent and the subsequent Drive connection acceptance remain pending; this is not evidence of completed token exchange or Drive access.

- Applied only additive migrations `20260905090000_add_app_tool_mcp_market_foundation` and `20260905093000_harden_app_market_lifecycle` to the verified staging Neon database; Prisma reported all 24 repository migrations applied.
- Full serial staging regression passed 27/27 after migration. Local full regression also passed 27/27, with authenticated localhost acceptance covering install, idempotent replay, connection-required health failure, disable, and uninstall.
- Preview deployment `dpl_EhoRwohjPLP4zLMGBBnS2tPRNiG7` is Ready at `https://hermes-agent-mission-control-r2k7rry1s.vercel.app` from the completed M18 implementation. Authenticated acceptance covered Market page/API access, install, HTTP 200 idempotent replay, `CONNECTION_REQUIRED` health state, disable, and uninstall.
- Preview-only database variables were corrected for the acceptance deployment; Production variables, production database, `main`, and canonical production/staging aliases were not changed.
- Temporary staging acceptance data was removed after verification: the generated acceptance user, its one-member `local-development` organization, `local` project, installation, and related audit/history records. Curated global catalog rows were retained.
- Real Google OAuth credential consent was not exercised; the implementation preserves explicit scope selection and existing encrypted connection boundaries. No provider credential, employee permission, policy exception, or execution authority is granted by installation.
- Final static Security Review found no remaining M18 findings after hardening Drive query escaping, project-scoped disconnects, OAuth role/lifecycle races, execution replay guards, compare-and-set transitions, and transactional audit/idempotency recovery. Live provider OAuth and concurrent database race testing remain unexercised.

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

- Authoritative worktree: `C:\Users\Samsung\.codex\worktrees\45f2\hermes-agent-mission-control`.
- Worktree is detached at the pushed `phase-3` history; use `HEAD:phase-3` for deliberate pushes from this checkout.
- M17 application commit: `49c8f3a7cfe017838cbd814ba3821160c54422e4`.
- M17 migration/test closeout commits follow it on `origin/phase-3`.
- Production and `main` remain untouched.

## Warnings for a future approved milestone

- Identify the authoritative worktree before editing; the Documents checkout may be stale.
- Re-read the six RogerOS documents, then verify Git/code/migrations/tests yourself.
- Do not recreate completed M1–M17 systems or hardcode dogfood projects.
- Do not touch production, `main`, production Hermes/bridge, or production data without explicit authorization.
- For any Hermes or VPS operation, first provide the owner a self-contained prompt for the dedicated Hermes VPS Codex task, then continue from its returned handoff. Do not silently combine repository and VPS mutations.
- Read-only VPS inspection found the unrelated production `hermyhq-bridge.service` already in an auto-restart failure loop. It was not touched. Do not fold investigation or repair of that service into M16 without a separate owner-approved VPS prompt.
