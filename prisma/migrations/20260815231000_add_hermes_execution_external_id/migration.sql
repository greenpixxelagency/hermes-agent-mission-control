-- Persist the staging adapter's opaque execution identifier so lifecycle refreshes
-- are tied to the same RogerOS execution without exposing adapter credentials.
ALTER TABLE "HermesExecution" ADD COLUMN "externalExecutionId" TEXT;

CREATE UNIQUE INDEX "HermesExecution_externalExecutionId_key"
  ON "HermesExecution"("externalExecutionId");

CREATE INDEX "HermesExecution_projectId_taskId_createdAt_idx"
  ON "HermesExecution"("projectId", "taskId", "createdAt");
