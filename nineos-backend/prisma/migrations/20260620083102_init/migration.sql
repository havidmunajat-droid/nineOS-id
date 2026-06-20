-- CreateTable
CREATE TABLE "platforms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "themePrimaryColor" VARCHAR(7) NOT NULL DEFAULT '#A32D2D',
    "themeSecondaryColor" VARCHAR(7) NOT NULL DEFAULT '#121212',
    "readinessStatus" VARCHAR(20) NOT NULL DEFAULT 'not_ready',
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'staging',
    "baseUrl" TEXT NOT NULL,
    "authType" VARCHAR(20) NOT NULL DEFAULT 'api_key',
    "apiKeyEncrypted" TEXT,
    "oauthClientId" TEXT,
    "oauthClientSecretEncrypted" TEXT,
    "oauthAccessTokenEncrypted" TEXT,
    "oauthRefreshTokenEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "connectionStatus" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "lastCheckedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_health_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "checkedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL,
    "responseTimeMs" INTEGER,
    "errorDetail" TEXT,

    CONSTRAINT "platform_health_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_endpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID NOT NULL,
    "capability" VARCHAR(50) NOT NULL,
    "method" VARCHAR(10) NOT NULL DEFAULT 'GET',
    "path" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "platform_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_sync_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platformId" UUID,
    "jobType" VARCHAR(50) NOT NULL,
    "triggeredBy" VARCHAR(20) NOT NULL DEFAULT 'n8n',
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "payload" JSONB,
    "result" JSONB,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "automation_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platforms_slug_key" ON "platforms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "platform_connections_platformId_environment_key" ON "platform_connections"("platformId", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "platform_endpoints_platformId_capability_key" ON "platform_endpoints"("platformId", "capability");

-- AddForeignKey
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_health_logs" ADD CONSTRAINT "platform_health_logs_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_endpoints" ADD CONSTRAINT "platform_endpoints_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_sync_jobs" ADD CONSTRAINT "automation_sync_jobs_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
