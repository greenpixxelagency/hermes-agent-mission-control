CREATE TYPE "HermesRuntimeKind" AS ENUM ('HERMES_PROFILE', 'HERMES_BOT');
CREATE TYPE "HermesProvisioningState" AS ENUM ('UNPROVISIONED', 'PROVISIONING', 'READY', 'FAILED');
CREATE TYPE "HermesReconciliationState" AS ENUM ('IN_SYNC', 'DRIFTED', 'SYNCING', 'FAILED');
CREATE TYPE "HermesRuntimeAssignmentState" AS ENUM ('ACTIVE', 'SUSPENDED', 'RETIRED');

ALTER TABLE "HermesRuntimeAssignment"
  ADD COLUMN "runtimeKind" "HermesRuntimeKind" NOT NULL DEFAULT 'HERMES_PROFILE',
  ADD COLUMN "assignmentState" "HermesRuntimeAssignmentState" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "provisioningState" "HermesProvisioningState" NOT NULL DEFAULT 'UNPROVISIONED',
  ADD COLUMN "reconciliationState" "HermesReconciliationState" NOT NULL DEFAULT 'DRIFTED',
  ADD COLUMN "desiredDisplayName" TEXT,
  ADD COLUMN "desiredDescription" TEXT,
  ADD COLUMN "desiredSoulRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "desiredSoulHash" TEXT,
  ADD COLUMN "desiredModelProvider" TEXT,
  ADD COLUMN "desiredModelId" TEXT,
  ADD COLUMN "desiredSkillRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "desiredRoutineRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastObservedHermesVersion" TEXT,
  ADD COLUMN "capabilityFingerprint" TEXT,
  ADD COLUMN "lastReconciledAt" TIMESTAMP(3),
  ADD COLUMN "lastReconcileError" TEXT,
  ADD COLUMN "runtimeStatus" TEXT,
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD COLUMN "externalRuntimeMetadata" JSONB;

DROP INDEX "HermesRuntimeAssignment_projectId_runtimeId_key";
CREATE UNIQUE INDEX "HermesRuntimeAssignment_projectId_employeeProjectAssignmentId_key"
  ON "HermesRuntimeAssignment"("projectId", "employeeProjectAssignmentId");
