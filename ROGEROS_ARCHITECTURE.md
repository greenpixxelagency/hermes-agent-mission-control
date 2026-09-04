# RogerOS architecture

## Product boundary

RogerOS is a SaaS/micro-SaaS product for external customers. Organizations and Projects are generic multi-tenant concepts. Buddhaji and Vhalam are internal staging dogfood projects only: product behavior must never depend on their names, slugs, IDs, credentials, business details, or existence.

Hermes is the primary AI execution runtime. RogerOS is the authoritative control plane and owns tenancy, employees, project assignments, tasks, Project Brain, permissions, policies, approvals, audit history, tool governance, and authoritative business state. Hermes and other providers execute approved work through adapters; they are not authoritative business storage. Prompts, model instructions, and runtime configuration are never security boundaries.

The current RogerOS application lives under `/p/[projectSlug]` and uses a shared project shell. Some untouched upstream Hermy HQ routes remain beside it during the staged product transition.

## Tenancy and authorization

```text
User
  └─ OrganizationMember (organization role)
       └─ ProjectMember (project role)
            └─ Project
```

- `Organization` owns Projects and OrganizationMembers.
- `ProjectMember` connects one OrganizationMember to one Project and carries the project role.
- Server-side `requireProjectContext*` resolution authenticates the persistent User and looks up membership without disclosing inaccessible projects.
- Project-owned records carry `projectId`; composite keys and foreign keys prevent cross-project relationships where applicable.
- Routes and domain services authorize from server-resolved project context. Client state, URLs, prompts, and runtime identity do not grant access.

## Workforce and runtime

```text
Employee (reusable definition)
  └─ EmployeeProjectAssignment (project-owned employment)
       ├─ TaskAssignment
       ├─ EmployeeToolPermission
       ├─ EmployeeSkillAssignment
       └─ HermesRuntimeAssignment
```

- `Employee` describes a person or system employee without granting project access.
- `EmployeeProjectAssignment` makes that employee part of a Project and is the authoritative project-scoped identity for work and governance.
- `HermesRuntimeAssignment` connects a project employee to a `HermesRuntime` profile. RogerOS compiles desired identity, SOUL, runtime configuration, and approved skills from authoritative records.
- Reconciliation uses the typed Hermes adapter, observes runtime health/capabilities, records drift/failure safely, and writes AuditEvents.
- Runtime assignment never grants external Tool permission; governed Tool permissions remain separate.
- M17 Employee Market uses curated, versioned, non-secret catalog data. A hire creates a project-owned employment assignment plus immutable template/version and safe configuration snapshot provenance; it does not turn a mutable global Employee row into a cross-project control channel. Selected Skill and Tool recommendations remain non-grant metadata until separately approved through existing governed flows. See `ROGEROS_PHASE_3_PLAN.md`.

## Tasks and execution

- `Task` is authoritative project work with status, priority, dependencies, activities, and assignments to project members or employees.
- A Task is not a Hermes runtime task or mirror.
- `HermesExecution` is a project-owned execution attempt for a RogerOS Task. Dispatch checks project membership, role, task assignment, runtime assignment, and duplicate-active-execution rules.
- Dispatch moves a Task to `IN_PROGRESS`. A valid successful execution moves only the latest attempt to `REVIEW`; only an authorized human review can move the Task to `DONE`. Revision requests preserve prior output and return the Task to `TODO`, while failed attempts move it to `BLOCKED` for an explicit safe retry.
- The staging adapter reports terminal completion through a timestamped HMAC callback. RogerOS derives tenancy from the stored execution ID, rejects stale/forged/conflicting payloads, streams callback input through a strict byte limit before parsing, and retains bounded status synchronization as a fallback.
- Runtime refresh can reconcile and mutate lifecycle state, so it uses the same OWNER, ADMIN, or OPERATOR dispatch authority rather than read-only membership. Vercel Deployment Protection is crossed only by a protected project-scoped automation bypass credential held by the isolated staging adapter and sent to its fixed Preview callback URL.
- Execution lifecycle updates TaskActivity and AuditEvent records; provider IDs/results and immutable review evidence remain attached to the execution rather than replacing the Task.

## Project Brain

- `ProjectConstitution`, `KnowledgeItem`, `Decision`, and `ProjectMemory` are authoritative project-owned Brain records.
- `KnowledgeSource` records provenance. `DriveSource` can project explicitly scoped, read-only Google Drive material into a project source.
- Project Brain is not Hermes runtime memory. Runtime context may consume approved Brain material, but RogerOS retains ownership and provenance.

## Skills

- `Skill` is the governed global catalog: source identity, version, trust status, and enabled state.
- `EmployeeSkillAssignment` is the project-owned approval of a Skill for one employee assignment.
- Only trusted, enabled, explicitly allowlisted Hermes skill sources may be provisioned.
- Provisioning ensures a safe source artifact; reconciliation controls the active approved overlay for a specific runtime profile. RogerOS records desired and observed state plus audit evidence.

## Tools, connections, policies, approvals, and audit

- `ToolDefinition` and `ToolCapability` describe available governed capabilities.
- `ProjectTool`, `ProjectConnection`, scoped credentials, and connection scopes make a Tool usable by one Project.
- `EmployeeToolPermission` grants explicit project-scoped access; default is deny.
- Policies and SOPs remain RogerOS records. Policy evaluation may allow, block, advise, or require approval.
- `ApprovalRequest` gates consequential actions. `AuditEvent` records meaningful control-plane and runtime lifecycle actions with project ownership.
- Provider adapters execute only after RogerOS authorization. They do not decide tenancy or policy.
- M18 App/Tool/MCP Market uses curated, versioned, non-secret manifests. A `ProjectAppInstallation` is immutable-version provenance plus an explicit lifecycle state; it reuses the linked `ProjectTool` and `ProjectConnection` boundaries and never stores an endpoint, token, or raw credential. Installing creates no employee permission, connection scope, credential, policy exception, or execution authority.
- M18 lifecycle mutations are Owner/Admin-only, idempotency-keyed server actions. Only a verified typed connection flow may mark an installation connected; disable/uninstall blocks execution, cancels pending Tool approvals, and preserves governed history. Existing adapters re-check installation state immediately before execution.

## Engineering rules

- Preserve strict project isolation and server-side authorization.
- Reuse existing relations, services, components, and adapters; avoid duplicate architecture.
- Prefer normal RogerOS workflows over direct database or runtime mutation.
- Stage and verify migrations before production. Never infer production migration history from staging.
- Any architectural change must update this file.
- Future concepts must be marked planned until implemented and approved.
- `ROGEROS_PHASE_3_PLAN.md` reconciles the original Phase 3 blueprint with verified repository state and is the dependency plan for proposed work after M16. It does not itself approve a milestone.
