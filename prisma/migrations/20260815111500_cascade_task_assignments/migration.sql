ALTER TABLE "TaskAssignment" DROP CONSTRAINT "TaskAssignment_projectMemberId_projectId_fkey";
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_projectMemberId_projectId_fkey" FOREIGN KEY ("projectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
