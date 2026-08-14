-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP', 'CHANNEL');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'RESOLVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL,
    "slug" TEXT,
    "title" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "systemIdentity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "threadId" TEXT,
    "authorUserId" TEXT,
    "authorSystemIdentity" TEXT,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MESSAGE',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "rootMessageId" TEXT NOT NULL,
    "title" TEXT,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_projectId_type_updatedAt_idx" ON "Conversation"("projectId", "type", "updatedAt");
CREATE UNIQUE INDEX "Conversation_id_projectId_key" ON "Conversation"("id", "projectId");
CREATE UNIQUE INDEX "Conversation_projectId_slug_key" ON "Conversation"("projectId", "slug");
CREATE INDEX "ConversationParticipant_projectId_userId_idx" ON "ConversationParticipant"("projectId", "userId");
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_systemIdentity_key" ON "ConversationParticipant"("conversationId", "systemIdentity");
CREATE INDEX "Message_projectId_conversationId_createdAt_idx" ON "Message"("projectId", "conversationId", "createdAt");
CREATE INDEX "Message_projectId_threadId_createdAt_idx" ON "Message"("projectId", "threadId", "createdAt");
CREATE UNIQUE INDEX "Message_id_projectId_conversationId_key" ON "Message"("id", "projectId", "conversationId");
CREATE INDEX "Thread_projectId_conversationId_status_idx" ON "Thread"("projectId", "conversationId", "status");
CREATE UNIQUE INDEX "Thread_id_projectId_key" ON "Thread"("id", "projectId");
CREATE UNIQUE INDEX "Thread_projectId_rootMessageId_key" ON "Thread"("projectId", "rootMessageId");
CREATE UNIQUE INDEX "Thread_rootMessageId_projectId_conversationId_key" ON "Thread"("rootMessageId", "projectId", "conversationId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_projectId_fkey" FOREIGN KEY ("conversationId", "projectId") REFERENCES "Conversation"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_projectId_fkey" FOREIGN KEY ("conversationId", "projectId") REFERENCES "Conversation"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_projectId_fkey" FOREIGN KEY ("threadId", "projectId") REFERENCES "Thread"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_conversationId_projectId_fkey" FOREIGN KEY ("conversationId", "projectId") REFERENCES "Conversation"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_rootMessageId_projectId_conversationId_fkey" FOREIGN KEY ("rootMessageId", "projectId", "conversationId") REFERENCES "Message"("id", "projectId", "conversationId") ON DELETE RESTRICT ON UPDATE CASCADE;
