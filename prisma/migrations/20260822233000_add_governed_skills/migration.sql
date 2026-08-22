-- CreateEnum
CREATE TYPE "SkillTrustStatus" AS ENUM ('TRUSTED', 'UNTRUSTED');

-- CreateEnum
CREATE TYPE "EmployeeSkillAssignmentState" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "sourceIdentifier" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "trustStatus" "SkillTrustStatus" NOT NULL DEFAULT 'TRUSTED',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSkillAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeProjectAssignmentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "state" "EmployeeSkillAssignmentState" NOT NULL DEFAULT 'ACTIVE',
    "assignedByUserId" TEXT,
    "desiredVersion" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "lastReconciledAt" TIMESTAMP(3),
    "reconciliationStatus" "HermesReconciliationState" NOT NULL DEFAULT 'DRIFTED',
    "reconciliationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeSkillAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");
CREATE UNIQUE INDEX "Skill_sourceIdentifier_key" ON "Skill"("sourceIdentifier");
CREATE UNIQUE INDEX "EmployeeSkillAssignment_employeeProjectAssignmentId_skillId_key" ON "EmployeeSkillAssignment"("employeeProjectAssignmentId", "skillId");
CREATE INDEX "EmployeeSkillAssignment_projectId_state_idx" ON "EmployeeSkillAssignment"("projectId", "state");
CREATE INDEX "EmployeeSkillAssignment_skillId_state_idx" ON "EmployeeSkillAssignment"("skillId", "state");

ALTER TABLE "EmployeeSkillAssignment" ADD CONSTRAINT "EmployeeSkillAssignment_employeeProjectAssignmentId_projectId_fkey" FOREIGN KEY ("employeeProjectAssignmentId", "projectId") REFERENCES "EmployeeProjectAssignment"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeSkillAssignment" ADD CONSTRAINT "EmployeeSkillAssignment_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSkillAssignment" ADD CONSTRAINT "EmployeeSkillAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Small system-controlled catalog of official Hermes bundled skills. No external source input is accepted.
INSERT INTO "Skill" ("id", "slug", "name", "description", "category", "sourceType", "sourceIdentifier", "version", "trustStatus", "isEnabled", "createdAt", "updatedAt") VALUES
('skill_grounded_citations', 'grounded-citations', 'Grounded Research', 'Ground answers and working documents in cited, verifiable sources.', 'Research', 'SYSTEM', 'grounded-citations', '1.0.0', 'TRUSTED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('skill_document_actions', 'document-to-action-items', 'Document Action Planning', 'Extract clear obligations, deadlines, and next actions from business documents.', 'Operations', 'SYSTEM', 'document-to-action-items', '1.0.0', 'TRUSTED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('skill_weekly_review', 'weekly-review-planning', 'Weekly Review Planning', 'Turn commitments and stalled work into a focused weekly operating plan.', 'Operations', 'SYSTEM', 'weekly-review-planning', '1.0.0', 'TRUSTED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('skill_humanizer', 'humanizer', 'Natural Business Writing', 'Refine business writing into clear, natural language without generic AI phrasing.', 'Writing', 'SYSTEM', 'humanizer', '1.0.0', 'TRUSTED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('skill_competitor_news', 'competitor-news-monitor', 'Competitor Intelligence', 'Monitor named companies for material news and produce concise, cited updates.', 'Analysis', 'SYSTEM', 'competitor-news-monitor', '1.0.0', 'TRUSTED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
