-- Replace single-column membership foreign keys with composite keys that require
-- each ProjectMember to belong to the same organization as both related records.
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_organizationMemberId_fkey";
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_projectId_fkey";

ALTER TABLE "ProjectMember" ADD COLUMN "organizationId" TEXT NOT NULL;

CREATE UNIQUE INDEX "OrganizationMember_id_organizationId_key" ON "OrganizationMember"("id", "organizationId");
CREATE UNIQUE INDEX "Project_id_organizationId_key" ON "Project"("id", "organizationId");
CREATE INDEX "ProjectMember_organizationId_idx" ON "ProjectMember"("organizationId");

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_organizationId_fkey"
  FOREIGN KEY ("projectId", "organizationId") REFERENCES "Project"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_organizationMemberId_organizationId_fkey"
  FOREIGN KEY ("organizationMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
