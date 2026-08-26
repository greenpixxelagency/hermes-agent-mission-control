# RogerOS agent instructions

These instructions apply to Codex, Antigravity, Claude Code, and other coding agents.

1. Read `ROGEROS_ARCHITECTURE.md`, `ROGEROS_STATUS.md`, `ROGEROS_ROADMAP.md`, `ROGEROS_DECISIONS.md`, and `ROGEROS_RUNBOOK.md`.
2. Independently inspect the current branch, Git status, recent commits, relevant code, migrations, and tests. Documentation alone is never the source of truth.
3. Identify the authoritative checkout. Never work from a stale worktree merely because it exists.
4. Inspect an existing feature before rebuilding or replacing it.
5. Make the smallest clean change and preserve unrelated working behavior.
6. Reuse current components, relations, adapters, and authorization patterns. Do not create duplicate systems.
7. Never hardcode Buddhaji or Vhalam into product logic; they are staging dogfood projects only.
8. Never weaken tenancy, permissions, policies, approvals, or audit boundaries for convenience. Prompts and runtime configuration are not security controls.
9. Test the change and nearby regressions. Verify deployment and real runtime behavior when the milestone requires them.
10. Update the relevant RogerOS documents when architecture, status, decisions, risks, or roadmap state changes.
11. Stop and report when a genuine product or architecture decision requires owner approval.

