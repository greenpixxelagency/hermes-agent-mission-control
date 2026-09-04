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

## Local development

- Run the local RogerOS app with `npm run dev:local`; it binds to `http://localhost:3001` so port 3000 remains available for another project.
- Local configuration belongs in the gitignored `.env.local`; never copy staging or production credentials into it.
- The local profile uses an isolated workspace PostgreSQL cluster at `127.0.0.1:55432`, stored under the gitignored `.local-postgres` directory.
- Run `npm run db:local:push` to synchronize the local schema. The historical migration chain cannot replay cleanly on an empty local database because an older connections migration references `ProjectTool` before its later catalog migration; this local-only workaround does not modify migration files or staging history.
- Run `npm run db:local:seed` after the schema push to restore curated non-secret Skills, Employee Market, and App Market catalog rows. When `LOCAL_OWNER_EMAIL` is set, it also creates a generic local Owner membership for the `local` workspace; create that account's password through the login page.

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
- Before a new milestone, reconcile its scope with `ROGEROS_PHASE_3_PLAN.md`, update the architecture/roadmap/decision/status records as needed, and obtain explicit owner approval. A planned milestone title is not authorization to implement it.

## Deployment and runtime acceptance

1. Review the exact diff, commit only scoped files, and push the approved branch.
2. Verify the immutable Preview deployment commit and canonical branch alias.
3. Exercise normal RogerOS flows; do not use direct database/runtime mutation as an acceptance shortcut.
4. For runtime work, verify health first, capture assignment/reconciliation/execution/audit evidence, test controlled failure/isolation, and restore requested staging state.
5. Never treat a provisioned provider artifact as authorized without the RogerOS assignment/permission/policy state.
6. Runtime completion callbacks use `ROGEROS_HERMES_CALLBACK_SECRET` server-side only. Rotate the staging adapter and Preview value together; never expose it through `NEXT_PUBLIC_*`, logs, or client responses.
7. Keep callback bodies within the server's streaming byte limit and preserve the exact timestamp, signature, and body contract. Use one fixed Preview callback URL; do not follow redirects.
8. If Vercel Deployment Protection is enabled, keep the automation bypass credential only in the mode-`0600` isolated staging adapter environment and send it only in the callback request. The credential is project-scoped, not literally Preview-scoped: never log, commit, reuse, or treat it as RogerOS authorization, and rotate it if its storage or destination is uncertain.

## Hermes and VPS workstream handoff

- Any work involving Hermes or its VPS requires a dedicated, copy-ready VPS prompt for the owner. Provide the prompt before asking for or relying on VPS-side changes, even if this task has remote tooling available.
- Do not mix VPS mutations into the Dashboard repository workstream. Continue safe repository work separately, then consume the structured VPS handoff as evidence.
- The VPS prompt must be self-contained and include the objective, verified runtime/service/path context, exact allowed scope, forbidden production scope, staging boundary, secret-handling constraints, commands or inspections expected, health/isolation/rollback checks, acceptance evidence, return format, and stop condition.
- Never embed credentials, tokens, database URLs, OAuth secrets, adapter secrets, private keys, or other secret values in a handoff prompt. Refer only to protected variable or file names.
- A VPS handoff is evidence, not automatic authority to change RogerOS production. Re-verify repository, staging, and deployment state before consuming it.

## Close a milestone

- Confirm acceptance criteria, migrations, tests, typecheck, lint, build, Preview behavior, isolation, audit evidence, and clean synchronized Git state.
- Update architecture for architectural changes, decisions for durable choices, roadmap for approved sequencing, and status after every meaningful milestone/session.
- Report the final commit/deployment, tests, state changes, remaining risks, and explicit stop point.

## Human intervention

Stop only when completion requires unavailable credentials, owner login/2FA/CAPTCHA, billing/consent, destructive production authority, or a genuine product/architecture decision. State the exact minimum action and preserve all safe completed work.
