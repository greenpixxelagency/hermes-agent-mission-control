-- M13 is additive. It introduces encrypted credential envelopes and
-- project-bound Drive provenance; it does not alter tenancy or existing data.
CREATE TYPE "ConnectionCredentialStatus" AS ENUM ('ACTIVE', 'NEEDS_ATTENTION', 'REVOKED');
CREATE TYPE "DriveScopeType" AS ENUM ('FOLDER', 'FILE');
CREATE TYPE "DriveSourceStatus" AS ENUM ('PENDING', 'READY', 'UNSUPPORTED', 'ERROR');

CREATE TABLE "ConnectionCredential" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "encryptedPayload" TEXT NOT NULL,
  "keyVersion" TEXT NOT NULL DEFAULT 'v1',
  "expiresAt" TIMESTAMP(3),
  "status" "ConnectionCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "accountEmail" TEXT,
  "accountDisplayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectionCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectConnectionScope" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "type" "DriveScopeType" NOT NULL,
  "externalId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "parentExternalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectConnectionScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriveOAuthState" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriveOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriveSource" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "scopeId" TEXT,
  "knowledgeSourceId" TEXT NOT NULL,
  "externalFileId" TEXT NOT NULL,
  "parentExternalId" TEXT,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "webUrl" TEXT,
  "modifiedAt" TIMESTAMP(3),
  "contentPreview" TEXT,
  "contentHash" TEXT,
  "status" "DriveSourceStatus" NOT NULL DEFAULT 'PENDING',
  "lastFetchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriveSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectionCredential_connectionId_key" ON "ConnectionCredential"("connectionId");
CREATE UNIQUE INDEX "ConnectionCredential_id_projectId_key" ON "ConnectionCredential"("id", "projectId");
CREATE UNIQUE INDEX "ConnectionCredential_connectionId_projectId_key" ON "ConnectionCredential"("connectionId", "projectId");
CREATE INDEX "ConnectionCredential_projectId_status_idx" ON "ConnectionCredential"("projectId", "status");
CREATE UNIQUE INDEX "ProjectConnectionScope_connectionId_type_externalId_key" ON "ProjectConnectionScope"("connectionId", "type", "externalId");
CREATE UNIQUE INDEX "ProjectConnectionScope_id_projectId_key" ON "ProjectConnectionScope"("id", "projectId");
CREATE INDEX "ProjectConnectionScope_projectId_connectionId_type_idx" ON "ProjectConnectionScope"("projectId", "connectionId", "type");
CREATE UNIQUE INDEX "DriveOAuthState_stateHash_key" ON "DriveOAuthState"("stateHash");
CREATE INDEX "DriveOAuthState_projectId_userId_expiresAt_idx" ON "DriveOAuthState"("projectId", "userId", "expiresAt");
CREATE UNIQUE INDEX "DriveSource_knowledgeSourceId_key" ON "DriveSource"("knowledgeSourceId");
CREATE UNIQUE INDEX "DriveSource_projectId_connectionId_externalFileId_key" ON "DriveSource"("projectId", "connectionId", "externalFileId");
CREATE UNIQUE INDEX "DriveSource_id_projectId_key" ON "DriveSource"("id", "projectId");
CREATE UNIQUE INDEX "DriveSource_knowledgeSourceId_projectId_key" ON "DriveSource"("knowledgeSourceId", "projectId");
CREATE INDEX "DriveSource_projectId_status_updatedAt_idx" ON "DriveSource"("projectId", "status", "updatedAt");
CREATE INDEX "DriveSource_projectId_connectionId_idx" ON "DriveSource"("projectId", "connectionId");

ALTER TABLE "ConnectionCredential" ADD CONSTRAINT "ConnectionCredential_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionCredential" ADD CONSTRAINT "ConnectionCredential_connectionId_projectId_fkey" FOREIGN KEY ("connectionId", "projectId") REFERENCES "ProjectConnection"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectConnectionScope" ADD CONSTRAINT "ProjectConnectionScope_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectConnectionScope" ADD CONSTRAINT "ProjectConnectionScope_connectionId_projectId_fkey" FOREIGN KEY ("connectionId", "projectId") REFERENCES "ProjectConnection"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriveOAuthState" ADD CONSTRAINT "DriveOAuthState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriveOAuthState" ADD CONSTRAINT "DriveOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriveSource" ADD CONSTRAINT "DriveSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriveSource" ADD CONSTRAINT "DriveSource_connectionId_projectId_fkey" FOREIGN KEY ("connectionId", "projectId") REFERENCES "ProjectConnection"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriveSource" ADD CONSTRAINT "DriveSource_scopeId_projectId_fkey" FOREIGN KEY ("scopeId", "projectId") REFERENCES "ProjectConnectionScope"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriveSource" ADD CONSTRAINT "DriveSource_knowledgeSourceId_projectId_fkey" FOREIGN KEY ("knowledgeSourceId", "projectId") REFERENCES "KnowledgeSource"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
