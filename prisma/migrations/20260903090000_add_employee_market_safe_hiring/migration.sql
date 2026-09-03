-- M17 is additive: the global catalog is curated/versioned and every hire is
-- project-owned. No existing employee, task, runtime, Skill, Tool, connection,
-- credential, or lifecycle record is altered.
CREATE TABLE "EmployeeMarketTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeMarketTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeMarketTemplateVersion" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "soulSummary" TEXT,
  "supportedSkillKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recommendedToolKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "kpiTemplates" JSONB NOT NULL DEFAULT '[]',
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeMarketTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeMarketHire" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "employeeProjectAssignmentId" TEXT NOT NULL,
  "templateVersionId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "configurationSnapshot" JSONB NOT NULL,
  "hiredByProjectMemberId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeMarketHire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeEmploymentActivity" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "employeeProjectAssignmentId" TEXT NOT NULL,
  "actorProjectMemberId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "detail" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeEmploymentActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeMarketTemplate_key_key" ON "EmployeeMarketTemplate"("key");
CREATE UNIQUE INDEX "EmployeeMarketTemplateVersion_templateId_version_key" ON "EmployeeMarketTemplateVersion"("templateId", "version");
CREATE INDEX "EmployeeMarketTemplateVersion_isEnabled_createdAt_idx" ON "EmployeeMarketTemplateVersion"("isEnabled", "createdAt");
CREATE UNIQUE INDEX "EmployeeMarketHire_employeeProjectAssignmentId_key" ON "EmployeeMarketHire"("employeeProjectAssignmentId");
CREATE UNIQUE INDEX "EmployeeMarketHire_projectId_templateKey_key" ON "EmployeeMarketHire"("projectId", "templateKey");
CREATE UNIQUE INDEX "EmployeeMarketHire_employeeProjectAssignmentId_projectId_key" ON "EmployeeMarketHire"("employeeProjectAssignmentId", "projectId");
CREATE UNIQUE INDEX "EmployeeMarketHire_id_projectId_key" ON "EmployeeMarketHire"("id", "projectId");
CREATE INDEX "EmployeeMarketHire_projectId_createdAt_idx" ON "EmployeeMarketHire"("projectId", "createdAt");
CREATE INDEX "EmployeeEmploymentActivity_projectId_employeeProjectAssignmentId_createdAt_idx" ON "EmployeeEmploymentActivity"("projectId", "employeeProjectAssignmentId", "createdAt");

ALTER TABLE "EmployeeMarketTemplateVersion" ADD CONSTRAINT "EmployeeMarketTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmployeeMarketTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeMarketHire" ADD CONSTRAINT "EmployeeMarketHire_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeMarketHire" ADD CONSTRAINT "EmployeeMarketHire_employeeProjectAssignmentId_projectId_fkey" FOREIGN KEY ("employeeProjectAssignmentId", "projectId") REFERENCES "EmployeeProjectAssignment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeMarketHire" ADD CONSTRAINT "EmployeeMarketHire_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "EmployeeMarketTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeMarketHire" ADD CONSTRAINT "EmployeeMarketHire_hiredByProjectMemberId_projectId_fkey" FOREIGN KEY ("hiredByProjectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeEmploymentActivity" ADD CONSTRAINT "EmployeeEmploymentActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeEmploymentActivity" ADD CONSTRAINT "EmployeeEmploymentActivity_employeeProjectAssignmentId_projectId_fkey" FOREIGN KEY ("employeeProjectAssignmentId", "projectId") REFERENCES "EmployeeProjectAssignment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeEmploymentActivity" ADD CONSTRAINT "EmployeeEmploymentActivity_actorProjectMemberId_projectId_fkey" FOREIGN KEY ("actorProjectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Curated non-secret catalog data. Recommendations are metadata only; this
-- migration intentionally creates no Skill assignments or Tool permissions.
INSERT INTO "EmployeeMarketTemplate" ("id", "key") VALUES
  ('market_template_operations_coordinator', 'operations-coordinator'),
  ('market_template_research_analyst', 'research-analyst');

INSERT INTO "EmployeeMarketTemplateVersion" ("id", "templateId", "version", "name", "role", "description", "soulSummary", "supportedSkillKeys", "recommendedToolKeys", "kpiTemplates") VALUES
  ('market_template_operations_coordinator_v1', 'market_template_operations_coordinator', 1, 'Operations Coordinator', 'Operations Coordinator', 'Coordinates approved project work, clarifies owners, and maintains reliable follow-through.', 'Keep work organized, surface blockers, and escalate consequential decisions.', ARRAY['weekly-review-planning', 'document-to-action-items'], ARRAY['google-drive'], '["Clear next actions","On-time follow-through"]'::JSONB),
  ('market_template_research_analyst_v1', 'market_template_research_analyst', 1, 'Research Analyst', 'Research Analyst', 'Produces grounded research briefs and concise decision support for approved project questions.', 'Use verifiable sources, distinguish evidence from inference, and escalate uncertainty.', ARRAY['grounded-citations', 'competitor-news-monitor'], ARRAY['google-drive'], '["Evidence quality","Decision-ready brief"]'::JSONB);
