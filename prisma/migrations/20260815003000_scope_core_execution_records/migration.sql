DROP INDEX "AgentEvent_createdAt_idx";
DROP INDEX "AgentRequest_status_idx";
DROP INDEX "HermesMemory_status_idx";
DROP INDEX "HermesMemory_type_idx";
DROP INDEX "HermesTask_board_idx";
DROP INDEX "HermesTask_status_idx";

ALTER TABLE "AgentEvent" ADD COLUMN "agentRequestId" TEXT,
  ADD COLUMN "projectId" TEXT NOT NULL;
ALTER TABLE "AgentRequest" ADD COLUMN "projectId" TEXT NOT NULL;

ALTER TABLE "HermesMemory" DROP CONSTRAINT "HermesMemory_pkey",
  ADD COLUMN "namespace" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "projectId" TEXT NOT NULL,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'hermes-wiki',
  ADD CONSTRAINT "HermesMemory_pkey" PRIMARY KEY ("projectId", "id");

ALTER TABLE "HermesTask" DROP CONSTRAINT "HermesTask_pkey",
  ADD COLUMN "projectId" TEXT NOT NULL,
  ADD CONSTRAINT "HermesTask_pkey" PRIMARY KEY ("projectId", "id");

CREATE TABLE "ProjectDataStore" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectDataStore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectDataStore_projectId_namespace_idx" ON "ProjectDataStore"("projectId", "namespace");
CREATE UNIQUE INDEX "ProjectDataStore_projectId_namespace_key_key" ON "ProjectDataStore"("projectId", "namespace", "key");
CREATE INDEX "AgentEvent_projectId_createdAt_idx" ON "AgentEvent"("projectId", "createdAt");
CREATE INDEX "AgentEvent_agentRequestId_idx" ON "AgentEvent"("agentRequestId");
CREATE INDEX "AgentRequest_projectId_status_idx" ON "AgentRequest"("projectId", "status");
CREATE INDEX "HermesMemory_projectId_namespace_type_idx" ON "HermesMemory"("projectId", "namespace", "type");
CREATE INDEX "HermesMemory_projectId_status_idx" ON "HermesMemory"("projectId", "status");
CREATE INDEX "HermesTask_projectId_board_idx" ON "HermesTask"("projectId", "board");
CREATE INDEX "HermesTask_projectId_status_idx" ON "HermesTask"("projectId", "status");

ALTER TABLE "ProjectDataStore" ADD CONSTRAINT "ProjectDataStore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_agentRequestId_fkey" FOREIGN KEY ("agentRequestId") REFERENCES "AgentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HermesTask" ADD CONSTRAINT "HermesTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HermesMemory" ADD CONSTRAINT "HermesMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
