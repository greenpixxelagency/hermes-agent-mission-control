CREATE TYPE "TaskStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "TaskActivityType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNMENT_CHANGED', 'DUE_DATE_CHANGED', 'COMPLETED');

CREATE TABLE "Task" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "parentTaskId" TEXT, "relatedThreadId" TEXT,
  "title" TEXT NOT NULL, "description" TEXT, "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM', "createdById" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "resultSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaskAssignment" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "taskId" TEXT NOT NULL, "projectMemberId" TEXT,
  "systemIdentity" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaskDependency" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "taskId" TEXT NOT NULL, "dependsOnTaskId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskDependency_not_self" CHECK ("taskId" <> "dependsOnTaskId")
);
CREATE TABLE "TaskActivity" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "taskId" TEXT NOT NULL, "actorUserId" TEXT,
  "type" "TaskActivityType" NOT NULL, "detail" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Task_projectId_status_updatedAt_idx" ON "Task"("projectId", "status", "updatedAt");
CREATE INDEX "Task_projectId_parentTaskId_idx" ON "Task"("projectId", "parentTaskId");
CREATE UNIQUE INDEX "Task_id_projectId_key" ON "Task"("id", "projectId");
CREATE INDEX "TaskAssignment_projectId_projectMemberId_idx" ON "TaskAssignment"("projectId", "projectMemberId");
CREATE UNIQUE INDEX "TaskAssignment_taskId_projectMemberId_key" ON "TaskAssignment"("taskId", "projectMemberId");
CREATE UNIQUE INDEX "TaskAssignment_taskId_systemIdentity_key" ON "TaskAssignment"("taskId", "systemIdentity");
CREATE INDEX "TaskDependency_projectId_dependsOnTaskId_idx" ON "TaskDependency"("projectId", "dependsOnTaskId");
CREATE UNIQUE INDEX "TaskDependency_taskId_dependsOnTaskId_key" ON "TaskDependency"("taskId", "dependsOnTaskId");
CREATE INDEX "TaskActivity_projectId_taskId_createdAt_idx" ON "TaskActivity"("projectId", "taskId", "createdAt");
CREATE UNIQUE INDEX "ProjectMember_id_projectId_key" ON "ProjectMember"("id", "projectId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_projectId_fkey" FOREIGN KEY ("parentTaskId", "projectId") REFERENCES "Task"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_relatedThreadId_projectId_fkey" FOREIGN KEY ("relatedThreadId", "projectId") REFERENCES "Thread"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_projectId_fkey" FOREIGN KEY ("taskId", "projectId") REFERENCES "Task"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_projectMemberId_projectId_fkey" FOREIGN KEY ("projectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_projectId_fkey" FOREIGN KEY ("taskId", "projectId") REFERENCES "Task"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnTaskId_projectId_fkey" FOREIGN KEY ("dependsOnTaskId", "projectId") REFERENCES "Task"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_projectId_fkey" FOREIGN KEY ("taskId", "projectId") REFERENCES "Task"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
