# RogerOS T2 voice-note and attachment contract

> **Approved architecture handoff, 2026-09-14.** This document makes the next T2 work self-contained for repository agents. It is a specification, not evidence that the feature exists. Every task must still verify the checkout, environment, adapter, storage, migrations, tests, and runtime independently.

## User outcome

A project member can press the microphone control in Team, record a bounded voice note, review or discard it, send it to one selected RogerOS employee, play it later, and receive the employee's response. RogerOS retains the original recording as a project-owned message attachment. Hermes transcribes the audio for the selected profile and receives only the transcript as the human instruction.

Documents, common images, and uploaded employee avatars use the same managed-asset foundation. Voice notes do not introduce live duplex voice, spoken employee replies, wake words, Discord/Telegram behavior, arbitrary files, profile configuration, Skills, MCP, browser control, or lessons.

## Verified evidence

Read-only verification at `2026-09-13T19:47:27Z` found:

- `rogeros-hermes-staging-adapter.service` active from `/opt/rogeros-hermes-staging/adapter`.
- Hermes container image digest `sha256:5057cf448949bca4f4379ef7392dd3bc6c516236c0adbadd50ea3276719be2e1`.
- Hermes `v0.21.0 (2026.8.31)`, upstream revision `b0d2148b`.
- Six healthy profile gateways: `default` 8642, `aarav` 8643, `ira` 8644, `kabir` 8645, `meher` 8646, and `vihaan` 8647.
- Adapter source hashes: `server.mjs` `c43af219f38444792950bc8d3aa89c3ff2685f9596a47a231768e6c6f99b2c0a`; `bot-runtime.mjs` `ba5a8bccaf7bbe07d8cbb1730dbfb94dd87ca80f1f335dfde89d4a03ee0d4cc8`; `binding-registry.mjs` `f55da05c6b460bd5f275102d9f4745bfce203a360c747c7373fbf01e12fd95bc`; `connection-contract.mjs` `ddd7c91984b5ea31e172f524d487387ac496f602be1530b8746bca8ea7dd4d68`.
- Current `POST /bots/{profileId}/messages` exact-shape input is only a 1–4000 character `message` plus UUID `correlationId`; Hermes receives text through its chat CLI and the adapter returns bounded CLI output.
- The assignment capability response has no attachment, MIME, size/count, digest, redemption, expiry, or receipt policy.
- Hermes's official Voice Mode documentation describes native speech-to-text for CLI/desktop/messaging and an authenticated `/api/audio/transcribe` relay/fallback. It also describes client-direct credentials and an internal cached-path mode; those two mechanisms are not approved RogerOS web contracts. Source: <https://hermes-agent.nousresearch.com/docs/user-guide/features/voice-mode>.

Verdict: native voice transcription is feasible; the RogerOS assignment-bound attachment contract is **ABSENT**.

## Ownership and storage

RogerOS is authoritative for the asset, conversation, message, authorization, retention state, and audit history. Hermes is a bounded processor for the selected runtime assignment.

The repository migration may add exact reviewed equivalents of:

- `ManagedAsset`: project ID, purpose/kind, lifecycle state, randomized storage key, sanitized filename, sniffed MIME, byte length, SHA-256 digest, safe image dimensions or audio duration when applicable, creator, timestamps, retention deadline, replacement/deletion state, and storage-provider key. It stores no bytes, credentials, permanent URL, or filesystem path.
- `MessageAttachment`: project ID, message ID, asset ID, stable ordinal, safe display metadata, and processing state. Composite foreign keys bind Message and ManagedAsset to the same project.
- `EmployeeProjectAssignment.avatarAssetId`: optional composite project-owned reference to an active image ManagedAsset. `avatarPresetKey` remains supported as the fallback and must not be removed.

The server-only storage abstraction must provide bounded put/open/delete operations without returning provider credentials or unrestricted URLs. Randomized keys must not contain project slugs, filenames, user input, profile keys, or secrets. Local development may use a gitignored root with resolved-path containment checks. Deployment requires an approved durable private object store, encryption at rest, fixed server-side credentials, lifecycle/retention behavior, and verified delete/rollback behavior.

## Versioned adapter contract

Names may change during implementation, but the identity and security fields may not be weakened. The capability and operation are default-deny until executable acceptance passes.

### Assignment capability

The signed assignment capability response adds a bounded object equivalent to:

```json
{
  "voiceNoteTranscription": {
    "available": true,
    "contractVersion": "rogeros-attachment-v1",
    "purpose": "VOICE_NOTE_TRANSCRIPTION",
    "acceptedMimeTypes": ["audio/webm", "audio/ogg", "audio/mp4"],
    "maxBytes": 12582912,
    "maxDurationMs": 120000
  }
}
```

Values are adapter-observed policy, not browser authority. RogerOS may enforce stricter limits. Unknown versions or missing fields mean unavailable.

### Transcription request

RogerOS sends the adapter a canonical signed request bound to:

- `contractVersion`, `purpose=VOICE_NOTE_TRANSCRIPTION`;
- opaque `projectId`, `runtimeId`, `runtimeAssignmentId`, and `profileId`;
- `conversationId`, `messageId`, `assetId`, `correlationId`, and authorized actor ID;
- sniffed MIME, exact byte length, SHA-256 digest;
- issued-at, short expiry, and cryptographically random nonce;
- an opaque redemption token or fixed-origin redemption path that contains no object-store credential, storage key, filename, or arbitrary URL.

The request uses the established server-to-server authentication plus canonical-body integrity signing. The adapter validates exact shape, timestamp, nonce, immutable binding, profile state, purpose, and limits before redemption.

### Redemption and transcription

The adapter redeems once from a configured fixed RogerOS origin over authenticated TLS. It must not accept a client-selected host, redirect, embedded credential, filesystem path, provider URL, or permanent bearer URL. It streams within the declared and absolute byte limits, calculates SHA-256 while streaming, sniffs media independently, and rejects length/digest/type disagreement before invoking Hermes.

The adapter routes transcription through the exact bound profile's supported Hermes v0.21.0 speech-to-text path. Provider credentials remain in protected profile/server configuration. No key is sent to the browser or returned to RogerOS. The adapter does not give the agent an audio filesystem path.

### Sanitized response

Success returns only a bounded typed result equivalent to:

```json
{
  "contractVersion": "rogeros-attachment-v1",
  "runtimeAssignmentId": "<opaque>",
  "profileId": "<bound-profile>",
  "assetId": "<opaque>",
  "correlationId": "<uuid>",
  "receiptId": "<opaque>",
  "status": "TRANSCRIBED",
  "transcript": "<bounded text>",
  "completedAt": "<timestamp>"
}
```

Failures use stable sanitized codes. Responses and logs never contain provider output envelopes, command output, credentials, paths, storage keys, redemption tokens, private URLs, raw audio, or unrelated profile data.

The same correlation/asset/assignment request is idempotent after success and returns the same safe receipt without retranscribing. Reusing a token with any changed field, after expiry, or for a different assignment/profile/project is denied. Redemption state is durable enough to reject replay across service restart.

## RogerOS upload and message flow

1. The user presses Record; only that gesture may request microphone permission.
2. `MediaRecorder` selects a browser-supported format from the server-advertised RogerOS allowlist. The UI shows recording state, elapsed time, pause/resume, limit, discard, and permission/error recovery.
3. The browser uploads bounded multipart bytes to RogerOS. Client MIME and filename are untrusted.
4. RogerOS streams within an absolute limit, sniffs the signature/container, rejects malformed or polyglot content, safely normalizes metadata where supported, calculates digest/duration, checks per-file/per-message/project quota, and writes using the storage abstraction.
5. Database creation and storage write use compensating rollback: no active asset/message attachment may point to a missing object, and a failed database transaction deletes the newly written object.
6. A project-owned Message and MessageAttachment are created through server-derived context and authorized conversation access.
7. RogerOS issues the short-lived adapter reference only for that stored active asset and exact selected runtime assignment.
8. The adapter redeems, verifies, transcribes, and returns the safe receipt. RogerOS submits the bounded transcript through the existing text Bot Chat flow and audits only safe identifiers/statuses.
9. The Team conversation displays the original voice-note player, duration, upload/transcription/send state, retry, and the normal employee response. Playback/download reauthorizes the current project member and uses safe headers.

## Validation and limits

Initial limits are conservative and must be constants covered by tests. The adapter-advertised maximum is an upper bound, never permission to exceed RogerOS policy.

- Voice: supported `MediaRecorder` containers only, at most 12 MiB and 120 seconds per note.
- Avatar image: JPEG, PNG, or WebP only; at most 5 MiB; decoded dimensions at most 4096×4096; safe decode/re-encode strips metadata and animation.
- Document: PDF, plain text, Markdown, DOCX, JPEG, PNG, or WebP; at most 20 MiB per file.
- At most 5 attachments and 25 MiB combined per message.

The first Vercel deployment uses the existing server-upload route and applies a stricter effective limit of 3.9 MB per browser file and 4.0 MB for the complete multipart body. This is intentionally below Vercel Functions' 4.5 MB request ceiling. The 12 MiB voice and 20 MiB document values remain validation/adapter upper bounds, not a claim that the first deployed browser transport accepts them. A later private client-direct upload design may raise the effective limit only after its grant, quota reservation, completion validation, normalization, and orphan cleanup are reviewed and accepted.

If the chosen decoding/transcription libraries cannot safely validate a listed format, remove that format from the effective allowlist rather than bypass validation. Archive containers such as DOCX require exact package validation and decompression bounds before any preview or Hermes ingestion. Document ingestion remains unavailable until separately supported by the proven adapter capability; document cards and authorized download may exist without claiming Hermes read the document.

Downloads use a sanitized `Content-Disposition`, `X-Content-Type-Options: nosniff`, a validated content type, private/no-store caching unless an explicitly reviewed authenticated caching policy replaces it, and no inline rendering for unsafe or unsupported formats. Filenames cannot inject headers or paths.

## Authorization, audit, retention, and deletion

- Server-resolved project context and conversation participation govern message uploads, reads, playback, retry, and deletion. Client `projectId` is never authority.
- OWNER and ADMIN may upload, replace, or remove employee avatars; the target assignment and asset must share the current project.
- Roles allowed to send normal Bot Chat may send voice notes within the same assignment and conversation restrictions. VIEWER remains unable to operate Hermes.
- Audits record actor, project, safe target IDs, action, type, size, digest prefix if needed, lifecycle status, and safe failure code. They never record filenames when sensitive, transcripts, object keys, URLs, tokens, audio bytes, or credentials.
- Replacement switches the assignment to the new verified asset transactionally, then retires the prior asset for bounded cleanup. A failed replacement preserves the prior avatar.
- Message deletion preserves governed metadata/history as required while revoking ordinary download and scheduling object deletion. Retention and quota accounting include pending and retryable objects so failure cannot bypass limits.
- Cleanup is idempotent, bounded, observable, and retries failed provider deletion without making the object public.

## Required T2A acceptance

The dedicated Hermes/VPS task returns `PROVEN` only after executable tests and sanitized runtime evidence demonstrate:

- exact project/runtime/assignment/profile/message/asset/correlation routing;
- authenticated fixed-origin redemption;
- cross-project, cross-assignment, cross-profile, and actor-substitution denial;
- expiry, replay, changed-field, digest, MIME, count, duration, and size denial;
- bounded streaming and redirect/path/arbitrary-URL rejection;
- correct transcription routing for at least two distinct healthy profiles;
- idempotent retry without duplicate transcription;
- safe failures, responses, logs, restart-persistent replay state, health, and rollback;
- no path, token, credential, private URL, raw bytes, or raw command output leakage.

No production action is part of this acceptance. If Hermes's supported transcription cannot be invoked without an unsafe path, credential exposure, shared-profile ambiguity, or unbounded provider response, return `PARTIAL` or `ABSENT` and stop.

## Required T2B acceptance

After T2A is `PROVEN` and durable storage is approved:

- review the additive migration before applying it to the verified isolated local database;
- test malformed/polyglot files, image decode/re-encode, audio container/duration, limits, quotas, safe names/headers, storage/database rollback, replacement preservation, deletion retry, retention, authorization, and cross-project composite constraints;
- test microphone denial, retry, pause, discard, playback, browser format fallback, and duplicate-submit/IME regressions;
- prove real selected-profile transcription and response for a voice note with no leaked path, token, credential, or URL;
- run accepted T1 Team tests, relevant bot/tenancy/audit regressions, TypeScript, scoped lint, Prisma validation/generation, production build, and authenticated localhost desktop/mobile acceptance;
- update the plan/status with evidence and commit only the bounded T2 work.

## Exact next-task instruction

A new repository agent reads `AGENTS.md` and the documents it names, then starts with T2A exactly as specified here. It must keep Hermes/VPS changes in the dedicated workstream and must not begin T2B until the returned verdict is `PROVEN`. It must not begin T3 or T4, mutate production, deploy, change models/files/Skills/MCP/browser/lessons, or weaken any ownership, storage, redemption, or redaction rule.

For a new task created inside this saved repository project, the user-visible prompt may be only: `Continue the next approved RogerOS Team Experience work from AGENTS.md.` The agent must derive the full context and current stop point from the repository documents rather than asking the owner to repeat this chat. A task created outside this repository cannot read these files automatically and still requires the complete dedicated Hermes/VPS handoff required by `ROGEROS_AGENT_INSTRUCTIONS.md`.
