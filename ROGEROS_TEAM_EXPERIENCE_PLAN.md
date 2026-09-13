# RogerOS Team Experience implementation plan

> **Approved product direction, 2026-09-14.** This is the durable handoff for phased Team/chat, employee-studio, browser, and lesson work. It is not proof that a phase is complete. Every task must independently verify the checkout, code, schema, tests, runtime, and adapter.

## Outcome

Turn Team into a conversational AI workplace: each main Hermes Bot Mode profile is one recognizable RogerOS employee, chat feels as natural as Slack, WhatsApp, or Grok, employee customization is understandable, and advanced controls remain truthful and project-scoped.

The existing main-Hermes connection remains authoritative for execution. RogerOS remains authoritative for tenancy, employee presentation, permissions, managed assets, conversations, tasks, approvals, and audit.

## Verified baseline

- Local Team reconciles six existing main Hermes profiles one-to-one and reports all six online.
- Chat, retained history, same-project mentions, governed Add Bot, reconciliation, and signed retirement exist.
- The default Hermes profile is protected from retirement.
- Adapter capabilities are default-deny. Browser takeover, observation teaching, and managed MCP remain unavailable until their exact assignment-scoped capability is proven.
- Message stores text today. There is no governed message-attachment or managed employee-avatar asset model.
- The current Team UI is a control desk, not yet a polished messenger.

### Verified T2 dependency, 2026-09-14

- Hermes v0.21.0 already provides voice capture/transcription features for its CLI, desktop, Telegram, and Discord surfaces, including an authenticated audio-transcription relay used by its clients. This proves voice transcription is technically feasible and should be reused rather than rebuilt.
- The connected RogerOS adapter remains text-only: `POST /bots/{profileId}/messages` accepts exactly `message` and `correlationId`. It has no attachment capability, redemption endpoint, supported-media policy, or sanitized attachment receipt.
- T2 therefore begins with the separate Hermes adapter/runtime prerequisite in `ROGEROS_T2_VOICE_ATTACHMENT_CONTRACT.md`. Repository schema, storage, and UI work must not claim Hermes receipt until that prerequisite returns `PROVEN` evidence.

## Product experience

### Conversation layout

- Desktop uses a team rail, a primary conversation, and an optional right context panel. Mobile uses one surface at a time with predictable back navigation.
- Conversation includes human and employee bubbles, avatars, timestamps, delivery/error states, date separators, working feedback, history loading, empty states, and visible employee identity.
- Enter sends, Shift+Enter inserts a newline, IME composition never sends, and an in-flight submit cannot duplicate a message.
- The growing composer provides attachment, voice-note, mention, and command entry points.
- /model opens the same model picker used by employee settings; commands are UI actions, not text sent to Hermes.

### Employee identity and avatars

- Every employee has an avatar in the roster, messages, mentions, settings header, and browser panel.
- T1 ships a curated local preset catalog of animal faces with stable keys and accessible names. Presets are code-owned SVG or illustration assets, not remote URLs or platform-dependent emoji.
- Avatar choice is project-specific and belongs to EmployeeProjectAssignment, so reusable employees cannot leak presentation state between projects.
- T2 supports user uploads through a managed asset and object-storage adapter. Uploads require MIME sniffing, size/dimension limits, metadata stripping, safe decode/re-encode, randomized keys, authorization, audit, replacement, and deletion behavior. Never store base64 images in an employee row.

### Chief of Staff

- Keep the immutable Hermes profile key default and its retirement protection.
- Present its RogerOS role as Chief of Staff; preserve Hermes Default as the initial display name unless the owner explicitly renames it.
- Coordination and mentions grant no implicit credential, Tool, MCP, or cross-project authority.

### Optional context panel

- Closed by default; opened from the conversation header; resizable on desktop and full-height on mobile.
- Tabs may include Browser, Employee, Files, Skills, MCP, and Lessons as their phases become functional.
- Browser follows the selected employee and preserves its session while hidden.
- Take control appears only inside a live browser session after viewer-lease and takeover capabilities are proven. Return control to agent is explicit.

### Rich messages

- Documents and voice notes are first-class message attachments rather than pasted links.
- Document cards show safe filename, type, size, upload/scan state, and open/download actions. Preview is limited to explicitly supported safe formats.
- Voice notes support record, pause, discard, playback, duration, upload progress, and retry. Recording requires an explicit user gesture and visible recording state.
- Hermes receives only authorized, expiring, project-bound attachment references. Never expose filesystem paths, credentials, or unrestricted object URLs.
- Start with a conservative allowlist: PDF, TXT, Markdown, DOCX, common images, and supported browser audio, with per-file and per-message limits.

## Employee Studio

Employee settings become a clear full-height studio:

1. **Overview:** name, role, description, avatar, runtime status, profile identity, and safe lifecycle actions.
2. **Model:** assignment-sourced provider/model catalog, search, active model, setup-required states, confirmation, reconciliation, and rollback evidence.
3. **Profile files:** allowlisted profile-relative files such as SOUL.md, USER.md, approved configuration, and installed SKILL.md files. Include tree, editor, preview, diff, validation, backup/version, and restore. Never expose arbitrary VPS paths or secret files.
4. **Skills:** installed and available skills, readable SKILL.md, governed lifecycle, and reconciliation state.
5. **MCP:** configured servers, health, tools, enable/disable/add/edit/test, and secret-reference inputs. Saved secret values are never returned.
6. **Browser:** selected profile's isolated session and capability state.
7. **Lessons:** manual drafts first; observation recording only after the secure browser-event pipeline exists.

Provider/model lists are dynamic. OpenRouter, OpenAI/Codex, Ollama, or another provider appears only when Hermes reports it for that assignment. Unauthenticated providers show Setup required.

## Authority and adapter rules

- Every API derives authenticated project and role server-side. Employee and runtime records use project-scoped composite lookups.
- RogerOS signs adapter calls with opaque project, runtime, assignment, and profile IDs plus timestamp and nonce.
- Capabilities are default-deny and action-specific; UI visibility grants nothing.
- Adapter errors are bounded and sanitized. Secrets, absolute paths, command output, cookies, and credentials never enter browser responses or audits.
- Hermes configuration mutations create audit evidence and return observed reconciliation evidence rather than claiming an HTTP 200 means success.

## Proposed data additions

Exact names require schema review, but ownership is fixed:

- EmployeeProjectAssignment.avatarPresetKey for built-in avatars.
- ManagedAsset for project-owned uploaded avatars, documents, and audio with safe metadata and lifecycle state.
- Optional EmployeeProjectAssignment.avatarAssetId referencing a project-owned image asset.
- MessageAttachment joining a project-owned Message to a project-owned asset.
- Lesson draft/version records only when Lessons are implemented.

All additions preserve composite project ownership, bounded retention, and recoverable deletion. No migration is authorized outside its owning phase.

## Phased delivery

### T1 — Messenger foundation and preset identity

> **Completed locally, 2026-09-14 (`codex/t1-team-experience`).** Team is now messenger-first with a responsive roster/conversation layout, polished human/employee bubbles, timestamps and delivery/working states, history loading and auto-scroll, accessible animal avatar presets persisted on `EmployeeProjectAssignment`, guarded Enter/Shift+Enter/IME submission, a local-only `/model` interception shell, and a closed-by-default capability-truthful context panel. The reviewed migration adds only `avatarPresetKey` and normalizes the project-owned role of a bound `default` profile to Chief of Staff without renaming the profile. Authenticated localhost acceptance observed the established six-profile roster at 6/6 Online, Hermes Default as Chief of Staff, avatar persistence after reload, desktop/mobile navigation, unavailable browser state, and one non-duplicated multiline keyboard turn returning `ROGEROS_T1_KEYBOARD_OK`. This is local evidence only; it does not authorize staging/production deployment or any T2–T4 capability.

- Redesign Team into the conversational layout without replacing authorization or chat APIs.
- Add polished bubbles, header, roster identity, responsive behavior, loading/error states, auto-scroll/history behavior, and accessible focus.
- Implement keyboard behavior, duplicate-submit prevention, and /model interception shell.
- Add curated animal avatar presets and project-specific persistence.
- Set the default assignment's role to Chief of Staff through normal project-owned data, not profile-key renaming.
- Move Browser into a closed-by-default context panel with an honest unavailable state and no permanent takeover controls.
- Do not implement uploads, voice transport, arbitrary file access, fake browser controls, or fake model changes.

Acceptance: schema/migration review if needed, focused tests, TypeScript, scoped lint, production build, authenticated localhost browser verification for all six bots, keyboard behavior, avatar persistence, responsive layout, and 6/6 runtime health.

**Exact next-phase handoff:** T2 must start from the accepted T1 commit and implement only project-owned managed assets, message attachments, safe avatar upload/replace/remove, document cards, governed expiring Hermes attachment references, and user-gesture MediaRecorder voice notes. It must preserve T1 preset avatars and messenger behavior and must not add T3 model/files/Skills/MCP mutations or T4 browser takeover/lesson observation. Before implementation, independently re-verify schema, storage choices, authorization, audit, runtime attachment support, and the accepted T1 tests; stop if durable secret-safe object storage or a project-bound Hermes attachment contract is unavailable.

### T2 — Managed attachments, avatar uploads, and voice notes

- **T2A, separate Hermes/VPS workstream:** implement and verify the versioned assignment-bound voice-note/attachment redemption and transcription contract in `ROGEROS_T2_VOICE_ATTACHMENT_CONTRACT.md`. Reuse Hermes's supported transcription implementation behind the adapter. Do not expose its internal paths or client credentials. Return `PROVEN` isolation, expiry, replay, validation, redaction, and profile-routing evidence before repository transport integration.
- **T2B, RogerOS repository workstream:** after T2A is proven and a durable private object store is approved, add the project-owned models, storage adapter, upload/download services, Team UI, audit, quotas, retention, and adapter client integration described below.
- Add project-owned managed assets and message attachments.
- Add safe avatar upload/replace/remove, document cards, governed Hermes attachment references, and MediaRecorder voice notes.
- Apply validation, authorization, quotas, retention, audit, and an object-storage abstraction. Local development may use a gitignored provider; deployment requires an approved durable provider.

Voice-note flow: a user gesture starts `MediaRecorder`; RogerOS uploads and validates the bounded recording into private project-owned storage; the created Message and MessageAttachment establish project ownership; RogerOS issues a short-lived single-purpose reference; the adapter redeems and verifies it for the exact runtime assignment/profile/message correlation; Hermes transcribes it; and only the transcript is submitted through the existing Bot Chat path. The original voice note remains available through an authorized RogerOS playback/download response. Live voice chat and spoken agent replies are not included.

Acceptance: cross-project denial, malformed/polyglot rejection, limits, authorization tests, storage rollback, safe download headers, microphone denial/retry, real Hermes receipt for supported attachments, and no path or credential leakage.

**Exact T2A handoff:** start from the accepted T1/T2 architecture documents, independently verify the current main-Hermes and adapter versions, then implement only the contract in `ROGEROS_T2_VOICE_ATTACHMENT_CONTRACT.md` in the dedicated Hermes/VPS workstream. Do not change RogerOS schema/UI, model/files/Skills/MCP, browser control, lessons, production, or unrelated services. Stop unless the fixed-origin redemption, complete identity binding, single-use expiry/replay enforcement, bounded streaming validation, selected-profile transcription, safe receipt, tests, health, and rollback evidence can all be proven.

**Exact T2B handoff after T2A returns `PROVEN`:** start from accepted T1 commit `d9d52340ec337b218b3e4680636751cea1edf182` plus the accepted T2 architecture commit. Re-verify the contract evidence and durable storage provider, review the additive migration before applying it to a verified local target, and implement only ManagedAsset, MessageAttachment, uploaded avatars, document cards, and voice notes. Preserve all T1 interaction/runtime behavior and do not begin T3 or T4.

### T3 — Employee Studio, models, files, Skills, and MCP

- Build the shared /model and settings picker with a signed dynamic provider catalog.
- Add model-change reconciliation, allowlisted file read/edit/diff/backup/restore, Skills inspection/lifecycle, and managed MCP only when supported.

Acceptance: role enforcement, profile isolation, path-traversal denial, secret redaction, stale-write conflict handling, invalid-config rollback, dynamic provider states, audit evidence, and real main-Hermes reconciliation.

### T4 — Isolated browser control and Record Lesson

- Deliver profile-bound browser viewing, expiring user-bound leases, and atomic Take/Return Control ownership.
- Pause or drain agent browser input before human control and revoke human input on return or expiry.
- Record redacted semantic actions only, create a lesson draft, require review, then save an approved version.
- Manual lesson drafting may ship first but must be labeled accurately.

Acceptance: six-profile isolation, lease expiry/revocation, one input owner, reconnect behavior, redaction tests, no raw VNC/CDP/cookie capture, reviewed saving, rollback, audit evidence, and a dedicated Hermes VPS acceptance run.

### T5 — Reliability and product hardening

- Add pagination, search, message idempotency/retry, attachment cleanup, limits, observability, accessibility, performance budgets, recovery, and regression coverage.
- Preview/staging acceptance and production readiness remain separately authorized.

## Task and thread protocol

- One Codex task owns one phase or one explicitly separated VPS workstream.
- Each task reads AGENTS.md, ROGEROS_AGENT_INSTRUCTIONS.md, this plan, architecture, status, roadmap, decisions, and runbook, then verifies code and Git independently.
- Dependency order is T1 → T2 → T3 → T4 → T5. Dependent phases do not develop in parallel from stale branches.
- Repository and VPS changes remain separate tasks. VPS tasks use the complete prompt required by the agent instructions and return sanitized evidence.
- Each task updates this plan and status, runs acceptance, commits on a codex/ branch, and returns commit hash, tests, limitations, rollback, and the exact next handoff.
- Do not duplicate Team, Message, Employee, Skill, Tool, Connection, runtime assignment, adapter, authorization, or audit systems.

## Stop conditions

Stop the affected phase instead of weakening controls when any of these is missing: authoritative checkout, project ownership, signed adapter capability, secret-safe storage, recoverable migration/rollback, real runtime evidence for a claimed feature, or owner confirmation for a new destructive or production action.
