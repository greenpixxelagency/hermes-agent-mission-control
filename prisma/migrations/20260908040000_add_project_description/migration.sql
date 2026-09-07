-- Align the staging schema with the existing optional Project description
-- field. This is additive and preserves every existing project row.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "description" TEXT;
