CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED');
CREATE TYPE "AuditActorType" AS ENUM ('HUMAN','EMPLOYEE','SYSTEM');

CREATE TABLE "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByEmployeeAssignmentId" TEXT,
  "requestedByProjectMemberId" TEXT,
  "taskId" TEXT,
  "threadId" TEXT,
  "projectToolId" TEXT NOT NULL,
  "capabilityKey" TEXT NOT NULL DEFAULT '*',
  "actionKey" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "actionContext" JSONB NOT NULL,
  "authorizationSnapshot" JSONB NOT NULL,
  "policySnapshot" JSONB NOT NULL,
  "permissionLevel" "PermissionLevel",
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "decidedByProjectMemberId" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  "actorProjectMemberId" TEXT,
  "actorEmployeeAssignmentId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "taskId" TEXT,
  "approvalRequestId" TEXT,
  "projectToolId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovalRequest_id_projectId_key" ON "ApprovalRequest"("id","projectId");
CREATE INDEX "ApprovalRequest_projectId_status_requestedAt_idx" ON "ApprovalRequest"("projectId","status","requestedAt");
CREATE INDEX "ApprovalRequest_projectId_projectToolId_idx" ON "ApprovalRequest"("projectId","projectToolId");
CREATE INDEX "AuditEvent_projectId_createdAt_idx" ON "AuditEvent"("projectId","createdAt");
CREATE INDEX "AuditEvent_projectId_eventType_createdAt_idx" ON "AuditEvent"("projectId","eventType","createdAt");

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_project_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_employee_project_fkey" FOREIGN KEY ("requestedByEmployeeAssignmentId","projectId") REFERENCES "EmployeeProjectAssignment"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requester_project_fkey" FOREIGN KEY ("requestedByProjectMemberId","projectId") REFERENCES "ProjectMember"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_task_project_fkey" FOREIGN KEY ("taskId","projectId") REFERENCES "Task"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_thread_project_fkey" FOREIGN KEY ("threadId","projectId") REFERENCES "Thread"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_tool_project_fkey" FOREIGN KEY ("projectToolId","projectId") REFERENCES "ProjectTool"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decider_project_fkey" FOREIGN KEY ("decidedByProjectMemberId","projectId") REFERENCES "ProjectMember"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_project_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_member_project_fkey" FOREIGN KEY ("actorProjectMemberId","projectId") REFERENCES "ProjectMember"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_employee_project_fkey" FOREIGN KEY ("actorEmployeeAssignmentId","projectId") REFERENCES "EmployeeProjectAssignment"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_task_project_fkey" FOREIGN KEY ("taskId","projectId") REFERENCES "Task"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_approval_project_fkey" FOREIGN KEY ("approvalRequestId","projectId") REFERENCES "ApprovalRequest"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tool_project_fkey" FOREIGN KEY ("projectToolId","projectId") REFERENCES "ProjectTool"("id","projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
