-- M18 Part 2 keeps one market installation per project Tool and records only
-- safe idempotency metadata for lifecycle mutations.
CREATE UNIQUE INDEX "ProjectAppInstallation_projectId_projectToolId_key"
ON "ProjectAppInstallation"("projectId", "projectToolId");

ALTER TABLE "ProjectConnectionScope" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AppMarketMutation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorProjectMemberId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppMarketMutation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppMarketMutation_projectId_idempotencyKey_key"
ON "AppMarketMutation"("projectId", "idempotencyKey");
CREATE INDEX "AppMarketMutation_projectId_operation_createdAt_idx"
ON "AppMarketMutation"("projectId", "operation", "createdAt");

ALTER TABLE "AppMarketMutation" ADD CONSTRAINT "AppMarketMutation_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppMarketMutation" ADD CONSTRAINT "AppMarketMutation_actorProjectMemberId_projectId_fkey"
FOREIGN KEY ("actorProjectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
