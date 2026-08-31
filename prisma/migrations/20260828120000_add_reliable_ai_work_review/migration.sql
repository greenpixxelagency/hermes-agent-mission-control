-- M16 keeps Task authoritative while adding explicit human review and
-- callback evidence to each Hermes execution attempt.
CREATE TYPE "HermesExecutionReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVISION_REQUESTED');

-- Multiple terminal attempts are required for safe retries. Active duplicates
-- remain prevented by the existing transaction-scoped advisory lock.
DROP INDEX "HermesExecution_taskId_status_key";

ALTER TABLE "HermesExecution"
ADD COLUMN "reviewStatus" "HermesExecutionReviewStatus",
ADD COLUMN "reviewedByProjectMemberId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "callbackReceivedAt" TIMESTAMP(3),
ADD COLUMN "callbackFingerprint" TEXT;

CREATE INDEX "HermesExecution_taskId_status_idx" ON "HermesExecution"("taskId", "status");
CREATE INDEX "HermesExecution_projectId_reviewStatus_completedAt_idx" ON "HermesExecution"("projectId", "reviewStatus", "completedAt");

ALTER TABLE "HermesExecution"
ADD CONSTRAINT "HermesExecution_reviewedByProjectMemberId_projectId_fkey"
FOREIGN KEY ("reviewedByProjectMemberId", "projectId")
REFERENCES "ProjectMember"("id", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;
