-- T1 keeps built-in avatar presentation on the project-owned employment
-- assignment. No uploaded asset or runtime identity is introduced here.
ALTER TABLE "EmployeeProjectAssignment"
ADD COLUMN "avatarPresetKey" TEXT;

-- The immutable Hermes profile key remains `default`; only its RogerOS
-- project-assignment presentation role is normalized.
UPDATE "EmployeeProjectAssignment" AS assignment
SET "roleOverride" = 'Chief of Staff'
FROM "HermesRuntimeAssignment" AS runtime
WHERE runtime."employeeProjectAssignmentId" = assignment."id"
  AND runtime."projectId" = assignment."projectId"
  AND runtime."profileKey" = 'default'
  AND assignment."roleOverride" IS NULL;
