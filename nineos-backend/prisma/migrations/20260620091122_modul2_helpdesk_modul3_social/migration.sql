-- CreateTable
CREATE TABLE "helpdesk_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "channelType" VARCHAR(20) NOT NULL,
    "channelIdentifier" VARCHAR(255) NOT NULL,
    "accessTokenEncrypted" TEXT,
    "webhookVerifyTokenEncrypted" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpdesk_settings" (
    "platformId" UUID NOT NULL,
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "confidenceThreshold" DECIMAL(3,2) NOT NULL DEFAULT 0.75,
    "escalationKeywords" TEXT[] DEFAULT ARRAY['refund', 'komplain', 'marah', 'tipu']::TEXT[],
    "fallbackMessage" TEXT NOT NULL DEFAULT 'Terima kasih, pesanmu sudah kami terima. Tim kami akan membalas segera.',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_settings_pkey" PRIMARY KEY ("platformId")
);

-- CreateTable
CREATE TABLE "helpdesk_knowledge_base" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "category" VARCHAR(50),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpdesk_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "channelType" VARCHAR(20) NOT NULL,
    "customerIdentifier" VARCHAR(255) NOT NULL,
    "customerName" VARCHAR(150),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "assignedAgent" VARCHAR(150),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpdesk_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "senderType" VARCHAR(20) NOT NULL,
    "messageText" TEXT NOT NULL,
    "aiConfidenceScore" DECIMAL(3,2),
    "matchedKbId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpdesk_escalations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "escalatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedBy" VARCHAR(150),

    CONSTRAINT "helpdesk_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "channelType" VARCHAR(20) NOT NULL,
    "accountHandle" VARCHAR(150) NOT NULL,
    "accountIdExternal" VARCHAR(150),
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "title" VARCHAR(200),
    "caption" TEXT NOT NULL,
    "mediaType" VARCHAR(20) NOT NULL DEFAULT 'image',
    "mediaUrls" TEXT[],
    "aiPromptUsed" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "createdBy" VARCHAR(150),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contentId" UUID NOT NULL,
    "socialAccountId" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "postedAt" TIMESTAMPTZ(6),
    "externalPostId" VARCHAR(150),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_publish_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduleId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL,
    "responsePayload" JSONB,
    "attemptedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_publish_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "helpdesk_channels_platformId_channelType_key" ON "helpdesk_channels"("platformId", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_platformId_channelType_key" ON "social_accounts"("platformId", "channelType");

-- AddForeignKey
ALTER TABLE "helpdesk_channels" ADD CONSTRAINT "helpdesk_channels_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_settings" ADD CONSTRAINT "helpdesk_settings_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_knowledge_base" ADD CONSTRAINT "helpdesk_knowledge_base_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_conversations" ADD CONSTRAINT "helpdesk_conversations_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_conversations" ADD CONSTRAINT "helpdesk_conversations_platformId_channelType_fkey" FOREIGN KEY ("platformId", "channelType") REFERENCES "helpdesk_channels"("platformId", "channelType") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_messages" ADD CONSTRAINT "helpdesk_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "helpdesk_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_messages" ADD CONSTRAINT "helpdesk_messages_matchedKbId_fkey" FOREIGN KEY ("matchedKbId") REFERENCES "helpdesk_knowledge_base"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_escalations" ADD CONSTRAINT "helpdesk_escalations_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "helpdesk_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_schedules" ADD CONSTRAINT "content_schedules_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_schedules" ADD CONSTRAINT "content_schedules_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_publish_logs" ADD CONSTRAINT "content_publish_logs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "content_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
