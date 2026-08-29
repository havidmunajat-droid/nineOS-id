-- CreateTable
CREATE TABLE "platform_kpi_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID,
    "platformSlug" VARCHAR(50) NOT NULL,
    "period" VARCHAR(20) NOT NULL DEFAULT 'today',
    "gmv" DECIMAL(18,2),
    "revenue" DECIMAL(18,2),
    "activeUsers" INTEGER,
    "payload" JSONB NOT NULL,
    "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID,
    "executiveRole" VARCHAR(20),
    "toolName" VARCHAR(60) NOT NULL,
    "riskLevel" VARCHAR(20) NOT NULL DEFAULT 'read',
    "status" VARCHAR(30) NOT NULL DEFAULT 'executed',
    "args" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "decidedAt" TIMESTAMPTZ(6),
    "decidedBy" VARCHAR(50),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_kpi_snapshots_platformSlug_period_capturedAt_idx" ON "platform_kpi_snapshots"("platformSlug", "period", "capturedAt");

-- CreateIndex
CREATE INDEX "agent_actions_status_createdAt_idx" ON "agent_actions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_actions_sessionId_idx" ON "agent_actions"("sessionId");

-- AddForeignKey
ALTER TABLE "platform_kpi_snapshots" ADD CONSTRAINT "platform_kpi_snapshots_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
