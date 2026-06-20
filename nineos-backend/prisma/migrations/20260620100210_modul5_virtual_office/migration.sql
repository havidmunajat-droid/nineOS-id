-- CreateTable
CREATE TABLE "executives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roleCode" VARCHAR(20) NOT NULL,
    "displayName" VARCHAR(50) NOT NULL,
    "scopeDescription" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "aiModel" VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-6',
    "status" VARCHAR(20) NOT NULL DEFAULT 'not_ready',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_data_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "executiveId" UUID NOT NULL,
    "platformId" UUID,
    "dataDomain" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mode" VARCHAR(20) NOT NULL DEFAULT 'chat',
    "title" VARCHAR(200),
    "participantExecutiveIds" UUID[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "scheduledAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6),
    "endedAt" TIMESTAMPTZ(6),
    "summary" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "senderType" VARCHAR(20) NOT NULL,
    "speakerExecutiveId" UUID,
    "messageText" TEXT NOT NULL,
    "contextData" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "revenueTotal" DECIMAL(14,2),
    "expenseTotal" DECIMAL(14,2),
    "notes" TEXT,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "executives_roleCode_key" ON "executives"("roleCode");

-- CreateIndex
CREATE UNIQUE INDEX "executive_data_sources_executiveId_dataDomain_key" ON "executive_data_sources"("executiveId", "dataDomain");

-- AddForeignKey
ALTER TABLE "executive_data_sources" ADD CONSTRAINT "executive_data_sources_executiveId_fkey" FOREIGN KEY ("executiveId") REFERENCES "executives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_data_sources" ADD CONSTRAINT "executive_data_sources_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_messages" ADD CONSTRAINT "executive_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "executive_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_messages" ADD CONSTRAINT "executive_messages_speakerExecutiveId_fkey" FOREIGN KEY ("speakerExecutiveId") REFERENCES "executives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
