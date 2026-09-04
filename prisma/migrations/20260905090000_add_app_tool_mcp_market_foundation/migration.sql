-- M18 Part 1 is additive. Curated manifests are versioned, project installs
-- retain immutable provenance, and credential/connection execution remains in
-- the existing governed Tool and Connection models.
CREATE TYPE "AppInstallationStatus" AS ENUM ('INSTALLED', 'CONNECTING', 'CONNECTED', 'NEEDS_ATTENTION', 'DISABLED', 'UNINSTALLED');

CREATE TABLE "AppMarketManifest" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppMarketManifest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppMarketManifestVersion" (
  "id" TEXT NOT NULL,
  "manifestId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "toolDefinitionId" TEXT NOT NULL,
  "capabilityKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "connectionType" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppMarketManifestVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAppInstallation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectToolId" TEXT NOT NULL,
  "manifestVersionId" TEXT NOT NULL,
  "manifestKey" TEXT NOT NULL,
  "manifestVersion" INTEGER NOT NULL,
  "status" "AppInstallationStatus" NOT NULL DEFAULT 'INSTALLED',
  "configurationSnapshot" JSONB NOT NULL DEFAULT '{}',
  "installedByProjectMemberId" TEXT NOT NULL,
  "uninstalledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectAppInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppMarketManifest_key_key" ON "AppMarketManifest"("key");
CREATE UNIQUE INDEX "AppMarketManifestVersion_manifestId_version_key" ON "AppMarketManifestVersion"("manifestId", "version");
CREATE INDEX "AppMarketManifestVersion_isEnabled_createdAt_idx" ON "AppMarketManifestVersion"("isEnabled", "createdAt");
CREATE UNIQUE INDEX "ProjectAppInstallation_projectId_manifestKey_key" ON "ProjectAppInstallation"("projectId", "manifestKey");
CREATE UNIQUE INDEX "ProjectAppInstallation_id_projectId_key" ON "ProjectAppInstallation"("id", "projectId");
CREATE INDEX "ProjectAppInstallation_projectId_status_createdAt_idx" ON "ProjectAppInstallation"("projectId", "status", "createdAt");

ALTER TABLE "AppMarketManifestVersion" ADD CONSTRAINT "AppMarketManifestVersion_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "AppMarketManifest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppMarketManifestVersion" ADD CONSTRAINT "AppMarketManifestVersion_toolDefinitionId_fkey" FOREIGN KEY ("toolDefinitionId") REFERENCES "ToolDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectAppInstallation" ADD CONSTRAINT "ProjectAppInstallation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAppInstallation" ADD CONSTRAINT "ProjectAppInstallation_projectToolId_projectId_fkey" FOREIGN KEY ("projectToolId", "projectId") REFERENCES "ProjectTool"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectAppInstallation" ADD CONSTRAINT "ProjectAppInstallation_manifestVersionId_fkey" FOREIGN KEY ("manifestVersionId") REFERENCES "AppMarketManifestVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectAppInstallation" ADD CONSTRAINT "ProjectAppInstallation_installedByProjectMemberId_projectId_fkey" FOREIGN KEY ("installedByProjectMemberId", "projectId") REFERENCES "ProjectMember"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reference manifest is curated, versioned, and non-secret. The existing
-- Google Drive connection flow owns OAuth and encrypted credential handling.
INSERT INTO "ToolDefinition" ("id", "key", "name", "description", "category", "builtIn", "createdAt", "updatedAt") VALUES
  ('market_tool_google_drive', 'google_drive', 'Google Drive', 'Scoped Google Drive knowledge connection.', 'KNOWLEDGE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "ToolCapability" ("id", "toolDefinitionId", "key", "name", "description")
SELECT capability."id", tool."id", capability."key", capability."name", capability."description"
FROM "ToolDefinition" AS tool
CROSS JOIN (VALUES
  ('market_tool_google_drive_drive_health', 'drive_health', 'Connection health', 'Read-only connection health check.'),
  ('market_tool_google_drive_drive_list', 'drive_list', 'List scoped files', 'List files only within explicit project scopes.'),
  ('market_tool_google_drive_drive_metadata', 'drive_metadata', 'Read scoped metadata', 'Read metadata for an explicitly allowed Drive object.'),
  ('market_tool_google_drive_drive_read', 'drive_read', 'Read scoped file', 'Read bounded content from an explicitly allowed supported file.'),
  ('market_tool_google_drive_drive_search', 'drive_search', 'Search scoped Drive', 'Search only within an explicitly selected folder scope.')
) AS capability("id", "key", "name", "description")
WHERE tool."key" = 'google_drive'
ON CONFLICT ("toolDefinitionId", "key") DO NOTHING;

INSERT INTO "AppMarketManifest" ("id", "key") VALUES ('market_manifest_google_drive', 'google-drive') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "AppMarketManifestVersion" ("id", "manifestId", "version", "name", "description", "category", "kind", "toolDefinitionId", "capabilityKeys", "connectionType")
SELECT 'market_manifest_google_drive_v1', 'market_manifest_google_drive', 1, 'Google Drive', 'Connect a project-selected Google Drive account through the existing scoped connection flow.', 'KNOWLEDGE', 'APP', "id", ARRAY['drive_health', 'drive_list', 'drive_metadata', 'drive_read', 'drive_search'], 'GOOGLE_DRIVE' FROM "ToolDefinition" WHERE "key" = 'google_drive'
ON CONFLICT ("manifestId", "version") DO NOTHING;
