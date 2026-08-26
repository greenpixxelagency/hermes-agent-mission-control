# RogerOS status

> **ROGEROS_STATUS.md is a handoff aid, not the source of truth. Always verify git status, recent commits, migrations, tests, and relevant code before working.**

Last updated: 2026-08-26

## Current state

- Authoritative development branch: `phase-3`.
- Meaningful M15 baseline: `3d82601724e8cb567578649e1c829478a0d64d7c` (`fix: report only active governed skills`).
- Current session: the documentation/handoff system, dogfood-hardcoding audit, and light/dark/system-preference theme foundation are implemented and validated on `phase-3`. No M16 work is approved or in progress.
- M15 is fully closed. Real Preview acceptance assigned `1-3-1 Communication`, reconciled it to the Vhalam Chief runtime, persisted `ROGEROS_M15_SKILL_OK`, audited the lifecycle, removed the assignment, and observed zero active governed skills afterward.
- Stable phase-3 Preview: `https://hermes-agent-missio-git-a9eea4-greenpixxelagency-2153s-projects.vercel.app`.
- Staging schema: all 20 repository migrations through `20260823013000_add_provisionable_hermes_skill` reported applied on 2026-08-26.

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

- No known foundation implementation remains after the current closeout; always verify the latest Preview and Git state before relying on this statement.
- No M16 definition exists in the repository. The next step is owner-approved milestone planning based on product priorities and this architecture—not implementation by assumption.

## Warnings for the next agent

- Identify the authoritative worktree before editing; the Documents checkout may be stale.
- Re-read the six RogerOS documents, then verify Git/code/migrations/tests yourself.
- Do not recreate completed M1–M15 systems or hardcode dogfood projects.
- Do not touch production, `main`, production Hermes/bridge, or production data without explicit authorization.
