# RogerOS engineering runbook

## Start every session

1. Locate candidate checkouts/worktrees and identify the authoritative one from the owner’s instruction, branch, remotes, recent commits, and status. Do not use a stale checkout by convenience.
2. Read `AGENTS.md`, `ROGEROS_AGENT_INSTRUCTIONS.md`, and every architecture/status/roadmap/decision/runbook or phase-contract document named there. T2 work must include `ROGEROS_TEAM_EXPERIENCE_PLAN.md` and `ROGEROS_T2_VOICE_ATTACHMENT_CONTRACT.md`.
3. Independently run `git status --short --branch`, inspect recent commits, migrations, relevant code, and tests.
4. Confirm scope, protected systems, current milestone, and stop condition before editing.
5. When auditing or planning, classify each claim as verified code/test/acceptance evidence, partial implementation, planned work, or legacy upstream behavior. Do not turn a shell label, a roadmap item, or a historical README into a completion claim.

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

## Local T2 voice acceptance

- Keep RogerOS on `http://localhost:3001` and the isolated T2A adapter on a local loopback endpoint such as `http://127.0.0.1:9098`. Do not point the local app at the connected/public Hermes adapter.
- Configure `HERMES_T2A_BASE_URL`, `HERMES_T2A_AUTH_TOKEN`, and `HERMES_T2A_HMAC_SECRET` only in gitignored `.env.local`. Matching adapter-side secrets remain in its mode-`0600` environment file and are never copied into chat, logs, or source control.
- The adapter must use one fixed redemption origin and call `POST /assets/{assetId}/redeem`; RogerOS never accepts a caller-selected redemption URL. For a cross-host localhost acceptance, use a bounded SSH local forward for adapter requests and a bounded reverse forward for adapter redemption callbacks. The dedicated VPS task owns both tunnel endpoints and any isolated-service configuration or restart.
- Before enabling voice, verify the isolated service is still bound to loopback, its compose runtime has no published port, `T2A_ENABLED` is false by default, and the protected connected/public Hermes adapter and six-profile runtime remain unchanged.
- Acceptance requires a real browser-recorded note for two project-owned assignments, selected-profile transcription, one normal Bot Chat response, replay/expiry/cross-scope denial, no duplicate send on retry, safe logs, and restoration to default-deny after the test unless the owner explicitly approves continued operation.
- When tunneling to a Windows localhost server, bind Next explicitly to `127.0.0.1`; a server listening only on `::1` cannot receive a reverse forward targeted at `127.0.0.1`. Verify both the local listener address and an adapter-side safe HTTP probe before spending a one-time redemption token.
- T2A must derive its temporary file suffix only from the validated MIME allowlist (`.webm`, `.ogg`, or `.m4a`) and pass that suffix explicitly to both media-probe and transcription subprocesses. A generic `.audio` suffix is rejected by Hermes's supported STT path.

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

## Local T3 Employee Studio acceptance

- Keep the adapter loopback-only and boot-disabled outside a bounded acceptance window. Configure only the five server-side variables named in `ROGEROS_T3_EMPLOYEE_STUDIO_CONTRACT.md`; never expose values.
- Verify exact `/v1/capabilities` identity first. Model catalog/read/set and profile read/update/restore are the only Stage 2 live mutation surfaces. Skill lifecycle and MCP must render unavailable.
- Exercise role and binding denial, stale CAS, replay/conflict, catalog expiry/signature rejection, fixed-key traversal and secret denial, successful reconciliation, rollback, and safe audit metadata; restore default-deny afterward.
- VPS proof does not authorize enabling the local client, migrating a shared database, deploying Preview, or touching production.
