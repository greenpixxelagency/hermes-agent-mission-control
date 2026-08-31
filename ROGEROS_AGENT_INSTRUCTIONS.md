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
12. For every task that requires inspecting, configuring, deploying, restarting, testing, or otherwise operating Hermes or its VPS, give the owner a complete copy-ready prompt for the dedicated Hermes VPS Codex task. This is mandatory even when remote access is technically available from the Dashboard task.
13. Keep Dashboard/repository work and Hermes/VPS work as explicit separate workstreams. Do not silently perform VPS operations from a RogerOS repository task. The owner decides when to send the VPS prompt and returns the resulting handoff to the repository task.
14. Every Hermes/VPS prompt must state: the exact objective; authoritative environment/service/path information already verified; permitted actions; protected production systems; staging-versus-production boundary; secret-handling rules; required health, isolation, rollback, and acceptance checks; evidence to return; and an explicit stop condition. Never place secret values in the prompt.
