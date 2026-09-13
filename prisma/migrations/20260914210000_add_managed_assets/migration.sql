-- T2 adds project-owned metadata for private objects. Object bytes, URLs,
-- credentials, and filesystem paths are deliberately not stored here.
CREATE TYPE "ManagedAssetKind" AS ENUM ('AVATAR', 'DOCUMENT', 'VOICE_NOTE', 'IMAGE');
CREATE TYPE "ManagedAssetState" AS ENUM ('PENDING', 'ACTIVE', 'DELETION_PENDING', 'DELETED', 'FAILED');
CREATE TYPE "MessageAttachmentState" AS ENUM ('READY', 'PROCESSING', 'FAILED');

CREATE TABLE "ManagedAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ManagedAssetKind" NOT NULL,
    "state" "ManagedAssetState" NOT NULL DEFAULT 'PENDING',
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "safeName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "createdById" TEXT NOT NULL,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagedAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "state" "MessageAttachmentState" NOT NULL DEFAULT 'READY',
    "processingReceiptId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetRedemption" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "runtimeAssignmentId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "authorizedActorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetRedemption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmployeeProjectAssignment" ADD COLUMN "avatarAssetId" TEXT;

CREATE UNIQUE INDEX "Message_id_projectId_key" ON "Message"("id", "projectId");
CREATE UNIQUE INDEX "ManagedAsset_storageKey_key" ON "ManagedAsset"("storageKey");
CREATE UNIQUE INDEX "ManagedAsset_id_projectId_key" ON "ManagedAsset"("id", "projectId");
CREATE INDEX "ManagedAsset_projectId_kind_state_createdAt_idx" ON "ManagedAsset"("projectId", "kind", "state", "createdAt");
CREATE INDEX "ManagedAsset_projectId_retentionUntil_idx" ON "ManagedAsset"("projectId", "retentionUntil");
CREATE UNIQUE INDEX "MessageAttachment_messageId_assetId_key" ON "MessageAttachment"("messageId", "assetId");
CREATE UNIQUE INDEX "MessageAttachment_id_projectId_key" ON "MessageAttachment"("id", "projectId");
CREATE INDEX "MessageAttachment_projectId_messageId_sortOrder_idx" ON "MessageAttachment"("projectId", "messageId", "sortOrder");
CREATE INDEX "MessageAttachment_projectId_assetId_idx" ON "MessageAttachment"("projectId", "assetId");
CREATE UNIQUE INDEX "AssetRedemption_tokenHash_key" ON "AssetRedemption"("tokenHash");
CREATE UNIQUE INDEX "AssetRedemption_id_projectId_key" ON "AssetRedemption"("id", "projectId");
CREATE UNIQUE INDEX "HermesRuntimeAssignment_id_projectId_runtimeId_profileKey_key" ON "HermesRuntimeAssignment"("id", "projectId", "runtimeId", "profileKey");
CREATE INDEX "AssetRedemption_projectId_assetId_expiresAt_idx" ON "AssetRedemption"("projectId", "assetId", "expiresAt");
CREATE INDEX "AssetRedemption_runtimeAssignmentId_correlationId_idx" ON "AssetRedemption"("runtimeAssignmentId", "correlationId");

ALTER TABLE "ManagedAsset" ADD CONSTRAINT "ManagedAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagedAsset" ADD CONSTRAINT "ManagedAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_projectId_fkey" FOREIGN KEY ("messageId", "projectId") REFERENCES "Message"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_assetId_projectId_fkey" FOREIGN KEY ("assetId", "projectId") REFERENCES "ManagedAsset"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeProjectAssignment" ADD CONSTRAINT "EmployeeProjectAssignment_avatarAssetId_projectId_fkey" FOREIGN KEY ("avatarAssetId", "projectId") REFERENCES "ManagedAsset"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetRedemption" ADD CONSTRAINT "AssetRedemption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRedemption" ADD CONSTRAINT "AssetRedemption_assetId_projectId_fkey" FOREIGN KEY ("assetId", "projectId") REFERENCES "ManagedAsset"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRedemption" ADD CONSTRAINT "AssetRedemption_conversationId_projectId_fkey" FOREIGN KEY ("conversationId", "projectId") REFERENCES "Conversation"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRedemption" ADD CONSTRAINT "AssetRedemption_messageId_projectId_conversationId_fkey" FOREIGN KEY ("messageId", "projectId", "conversationId") REFERENCES "Message"("id", "projectId", "conversationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRedemption" ADD CONSTRAINT "AssetRedemption_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "HermesRuntime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetRedemption" ADD CONSTRAINT "AssetRedemption_runtimeAssignment_binding_fkey" FOREIGN KEY ("runtimeAssignmentId", "projectId", "runtimeId", "profileId") REFERENCES "HermesRuntimeAssignment"("id", "projectId", "runtimeId", "profileKey") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetRedemption" ADD CONSTRAINT "AssetRedemption_authorizedActorId_projectId_fkey" FOREIGN KEY ("authorizedActorId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
