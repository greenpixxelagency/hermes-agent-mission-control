-- M12 is deliberately additive: no drops, truncation, or tenancy changes.
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'NEEDS_ATTENTION', 'DISABLED');
CREATE TYPE "ToolExecutionStatus" AS ENUM ('REQUESTED', 'PENDING_APPROVAL', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "ProjectConnection" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectToolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "credentialRef" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ToolExecution" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "employeeProjectAssignmentId" TEXT NOT NULL,
  "projectToolId" TEXT NOT NULL,
  "projectConnectionId" TEXT NOT NULL,
  "approvalRequestId" TEXT,
  "capabilityKey" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status" "ToolExecutionStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestMetadata" JSONB NOT NULL DEFAULT '{}',
  "resultMetadata" JSONB NOT NULL DEFAULT '{}',
  "resultText" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectConnection_projectId_projectToolId_key" ON "ProjectConnection"("projectId", "projectToolId");
CREATE UNIQUE INDEX "ProjectConnection_id_projectId_key" ON "ProjectConnection"("id", "projectId");
CREATE INDEX "ProjectConnection_projectId_status_idx" ON "ProjectConnection"("projectId", "status");
CREATE UNIQUE INDEX "ToolExecution_id_projectId_key" ON "ToolExecution"("id", "projectId");
CREATE INDEX "ToolExecution_projectId_status_createdAt_idx" ON "ToolExecution"("projectId", "status", "createdAt");
CREATE INDEX "ToolExecution_projectId_employeeProjectAssignmentId_created_idx" ON "ToolExecution"("projectId", "employeeProjectAssignmentId", "createdAt");
CREATE INDEX "ToolExecution_projectId_approvalRequestId_idx" ON "ToolExecution"("projectId", "approvalRequestId");

ALTER TABLE "ProjectConnection" ADD CONSTRAINT "ProjectConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectConnection" ADD CONSTRAINT "ProjectConnection_projectToolId_projectId_fkey" FOREIGN KEY ("projectToolId", "projectId") REFERENCES "ProjectTool"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_employeeProjectAssignmentId_projectId_fkey" FOREIGN KEY ("employeeProjectAssignmentId", "projectId") REFERENCES "EmployeeProjectAssignment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_projectToolId_projectId_fkey" FOREIGN KEY ("projectToolId", "projectId") REFERENCES "ProjectTool"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_projectConnectionId_projectId_fkey" FOREIGN KEY ("projectConnectionId", "projectId") REFERENCES "ProjectConnection"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_approvalRequestId_projectId_fkey" FOREIGN KEY ("approvalRequestId", "projectId") REFERENCES "ApprovalRequest"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
