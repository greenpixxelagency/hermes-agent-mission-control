CREATE TYPE "StudioMutationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'ROLLED_BACK', 'FAILED', 'ATTENTION');
CREATE TYPE "StudioProfileFileState" AS ENUM ('READY', 'ATTENTION');
CREATE TYPE "GovernedMcpAssignmentState" AS ENUM ('ENABLED', 'DISABLED', 'ATTENTION');

ALTER TABLE "HermesRuntimeAssignment"
  ADD COLUMN "studioConfigRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "observedModelProvider" TEXT,
  ADD COLUMN "observedModelId" TEXT,
  ADD COLUMN "observedConfigFingerprint" TEXT,
  ADD COLUMN "modelCatalogRevision" TEXT,
  ADD COLUMN "modelCatalogExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ConnectionCredential_id_projectId_connectionId_key"
  ON "ConnectionCredential"("id", "projectId", "connectionId");

CREATE TABLE "RuntimeConfigurationMutation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runtimeAssignmentId" TEXT NOT NULL,
  "actorProjectMemberId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status" "StudioMutationStatus" NOT NULL DEFAULT 'PENDING',
  "requestMetadata" JSONB NOT NULL DEFAULT '{}',
  "resultMetadata" JSONB NOT NULL DEFAULT '{}',
  "adapterReceiptId" TEXT,
  "errorCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuntimeConfigurationMutation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RuntimeConfigurationMutation_projectId_idempotencyKey_key" ON "RuntimeConfigurationMutation"("projectId", "idempotencyKey");
CREATE UNIQUE INDEX "RuntimeConfigurationMutation_id_projectId_key" ON "RuntimeConfigurationMutation"("id", "projectId");
CREATE INDEX "RuntimeConfigurationMutation_projectId_runtimeAssignmentId_createdAt_idx" ON "RuntimeConfigurationMutation"("projectId", "runtimeAssignmentId", "createdAt");
CREATE INDEX "RuntimeConfigurationMutation_projectId_status_createdAt_idx" ON "RuntimeConfigurationMutation"("projectId", "status", "createdAt");

CREATE TABLE "StudioProfileFile" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runtimeAssignmentId" TEXT NOT NULL,
  "logicalKey" TEXT NOT NULL,
  "state" "StudioProfileFileState" NOT NULL DEFAULT 'READY',
  "currentVersion" INTEGER NOT NULL,
  "currentSourceRevision" INTEGER NOT NULL,
  "currentDigest" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioProfileFile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudioProfileFile_projectId_runtimeAssignmentId_logicalKey_key" ON "StudioProfileFile"("projectId", "runtimeAssignmentId", "logicalKey");
CREATE UNIQUE INDEX "StudioProfileFile_id_projectId_key" ON "StudioProfileFile"("id", "projectId");
CREATE INDEX "StudioProfileFile_projectId_runtimeAssignmentId_state_idx" ON "StudioProfileFile"("projectId", "runtimeAssignmentId", "state");

CREATE TABLE "StudioProfileFileVersion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "profileFileId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "digest" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "adapterReceiptId" TEXT,
  "createdByProjectMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioProfileFileVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudioProfileFileVersion_profileFileId_version_key" ON "StudioProfileFileVersion"("profileFileId", "version");
CREATE UNIQUE INDEX "StudioProfileFileVersion_id_projectId_key" ON "StudioProfileFileVersion"("id", "projectId");
CREATE INDEX "StudioProfileFileVersion_projectId_profileFileId_createdAt_idx" ON "StudioProfileFileVersion"("projectId", "profileFileId", "createdAt");

CREATE TABLE "GovernedMcpAssignment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "runtimeAssignmentId" TEXT NOT NULL,
  "projectConnectionId" TEXT NOT NULL,
  "secretReferenceId" TEXT NOT NULL,
  "serverKey" TEXT NOT NULL,
  "state" "GovernedMcpAssignmentState" NOT NULL DEFAULT 'DISABLED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "observedFingerprint" TEXT,
  "lastObservedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernedMcpAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernedMcpAssignment_projectId_runtimeAssignmentId_serverKey_key" ON "GovernedMcpAssignment"("projectId", "runtimeAssignmentId", "serverKey");
CREATE UNIQUE INDEX "GovernedMcpAssignment_id_projectId_key" ON "GovernedMcpAssignment"("id", "projectId");
CREATE INDEX "GovernedMcpAssignment_projectId_runtimeAssignmentId_state_idx" ON "GovernedMcpAssignment"("projectId", "runtimeAssignmentId", "state");

CREATE TABLE "GovernedMcpToolAssignment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "mcpAssignmentId" TEXT NOT NULL,
  "toolKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernedMcpToolAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GovernedMcpToolAssignment_mcpAssignmentId_toolKey_key" ON "GovernedMcpToolAssignment"("mcpAssignmentId", "toolKey");
CREATE INDEX "GovernedMcpToolAssignment_projectId_mcpAssignmentId_enabled_idx" ON "GovernedMcpToolAssignment"("projectId", "mcpAssignmentId", "enabled");

ALTER TABLE "RuntimeConfigurationMutation" ADD CONSTRAINT "RuntimeConfigurationMutation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuntimeConfigurationMutation" ADD CONSTRAINT "RuntimeConfigurationMutation_runtimeAssignmentId_projectId_fkey" FOREIGN KEY ("runtimeAssignmentId", "projectId") REFERENCES "HermesRuntimeAssignment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RuntimeConfigurationMutation" ADD CONSTRAINT "RuntimeConfigurationMutation_actorProjectMemberId_projectId_fkey" FOREIGN KEY ("actorProjectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioProfileFile" ADD CONSTRAINT "StudioProfileFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioProfileFile" ADD CONSTRAINT "StudioProfileFile_runtimeAssignmentId_projectId_fkey" FOREIGN KEY ("runtimeAssignmentId", "projectId") REFERENCES "HermesRuntimeAssignment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioProfileFileVersion" ADD CONSTRAINT "StudioProfileFileVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioProfileFileVersion" ADD CONSTRAINT "StudioProfileFileVersion_profileFileId_projectId_fkey" FOREIGN KEY ("profileFileId", "projectId") REFERENCES "StudioProfileFile"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioProfileFileVersion" ADD CONSTRAINT "StudioProfileFileVersion_createdByProjectMemberId_projectId_fkey" FOREIGN KEY ("createdByProjectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GovernedMcpAssignment" ADD CONSTRAINT "GovernedMcpAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernedMcpAssignment" ADD CONSTRAINT "GovernedMcpAssignment_runtimeAssignmentId_projectId_fkey" FOREIGN KEY ("runtimeAssignmentId", "projectId") REFERENCES "HermesRuntimeAssignment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GovernedMcpAssignment" ADD CONSTRAINT "GovernedMcpAssignment_projectConnectionId_projectId_fkey" FOREIGN KEY ("projectConnectionId", "projectId") REFERENCES "ProjectConnection"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GovernedMcpAssignment" ADD CONSTRAINT "GovernedMcpAssignment_secretReferenceId_projectId_projectConnectionId_fkey" FOREIGN KEY ("secretReferenceId", "projectId", "projectConnectionId") REFERENCES "ConnectionCredential"("id", "projectId", "connectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GovernedMcpToolAssignment" ADD CONSTRAINT "GovernedMcpToolAssignment_mcpAssignmentId_projectId_fkey" FOREIGN KEY ("mcpAssignmentId", "projectId") REFERENCES "GovernedMcpAssignment"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
