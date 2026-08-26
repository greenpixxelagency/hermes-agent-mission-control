# RogerOS engineering runbook

## Start every session

1. Locate candidate checkouts/worktrees and identify the authoritative one from the owner’s instruction, branch, remotes, recent commits, and status. Do not use a stale checkout by convenience.
2. Read `AGENTS.md`, `ROGEROS_AGENT_INSTRUCTIONS.md`, and the architecture/status/roadmap/decision/runbook documents.
3. Independently run `git status --short --branch`, inspect recent commits, migrations, relevant code, and tests.
4. Confirm scope, protected systems, current milestone, and stop condition before editing.

## Staging and production

- Use only gitignored local staging credentials and never print or commit secrets.
- Prove database identity before migrations or stateful acceptance work.
- Keep `main`, production Vercel, production databases, production OAuth, Hermes/bridge, and automation systems untouched unless explicitly authorized.
- Dogfood seed scripts are for staging only. Product code must work for arbitrary organizations/projects.

## Migration safety

1. Inspect schema, migration history, and target migration state before generating or applying SQL.
2. Review SQL for drops, truncation, invalid referential actions, tenancy weakening, and unrelated changes.
3. Apply only to the verified target environment. Recover failed Prisma migrations using documented Prisma state, not blind history edits.
4. Run Prisma validation/generation/status afterward. Never infer production state from staging.

## Implementation and testing

- Inspect the existing feature and reuse its service, authorization, component, adapter, and audit patterns.
- Prefer the smallest cohesive change; do not mix paused/unrelated work into a commit.
- Run focused tests plus nearby tenancy/governance/runtime regressions, TypeScript, targeted lint, and the production build.
- When schema is unchanged, do not create a migration.

## Deployment and runtime acceptance

1. Review the exact diff, commit only scoped files, and push the approved branch.
2. Verify the immutable Preview deployment commit and canonical branch alias.
3. Exercise normal RogerOS flows; do not use direct database/runtime mutation as an acceptance shortcut.
4. For runtime work, verify health first, capture assignment/reconciliation/execution/audit evidence, test controlled failure/isolation, and restore requested staging state.
5. Never treat a provisioned provider artifact as authorized without the RogerOS assignment/permission/policy state.

## Close a milestone

- Confirm acceptance criteria, migrations, tests, typecheck, lint, build, Preview behavior, isolation, audit evidence, and clean synchronized Git state.
- Update architecture for architectural changes, decisions for durable choices, roadmap for approved sequencing, and status after every meaningful milestone/session.
- Report the final commit/deployment, tests, state changes, remaining risks, and explicit stop point.

## Human intervention

Stop only when completion requires unavailable credentials, owner login/2FA/CAPTCHA, billing/consent, destructive production authority, or a genuine product/architecture decision. State the exact minimum action and preserve all safe completed work.

