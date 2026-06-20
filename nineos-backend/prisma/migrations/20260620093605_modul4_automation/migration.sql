-- CreateTable
CREATE TABLE "automation_pipelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "pipelineType" VARCHAR(50) NOT NULL,
    "n8nWorkflowId" VARCHAR(100),
    "platformId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "config" JSONB,
    "lastRunAt" TIMESTAMPTZ(6),
    "lastRunStatus" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID,
    "reportType" VARCHAR(50) NOT NULL,
    "cronExpr" VARCHAR(50) NOT NULL,
    "recipients" TEXT[],
    "outputFormat" VARCHAR(20) NOT NULL DEFAULT 'json',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMPTZ(6),
    "nextRunAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID,
    "alertType" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'info',
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceType" VARCHAR(20) NOT NULL,
    "sourceId" UUID NOT NULL,
    "platformId" UUID,
    "reportType" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "payload" JSONB,
    "errorDetail" TEXT,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "automation_pipelines" ADD CONSTRAINT "automation_pipelines_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_alerts" ADD CONSTRAINT "automation_alerts_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_logs" ADD CONSTRAINT "report_logs_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
