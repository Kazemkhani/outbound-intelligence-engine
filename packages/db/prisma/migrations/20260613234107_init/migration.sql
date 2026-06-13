-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('c_level', 'vp', 'director', 'manager', 'ic');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('hiring', 'funding', 'tech_adoption', 'job_change', 'news', 'web_change');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('verified', 'risky', 'invalid', 'unknown');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('email', 'linkedin', 'whatsapp');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('active', 'paused', 'completed', 'stopped');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('queued', 'awaiting_approval', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'failed');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateTable
CREATE TABLE "IcpProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IcpProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "domain" TEXT,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "employeeCount" INTEGER,
    "revenueBand" TEXT,
    "country" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "placeId" TEXT,
    "localCategory" TEXT,
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "funding" JSONB,
    "socials" JSONB,
    "sources" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "seniority" "Seniority",
    "department" TEXT,
    "email" TEXT,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'unknown',
    "linkedinUrl" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "type" "SignalType" NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "sourceUrl" TEXT,
    "provider" TEXT NOT NULL,
    "evidence" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "icpProfileId" TEXT NOT NULL,
    "fit" DOUBLE PRECISION NOT NULL,
    "intent" DOUBLE PRECISION NOT NULL,
    "composite" DOUBLE PRECISION NOT NULL,
    "tier" "Tier" NOT NULL,
    "rationale" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SequenceStatus" NOT NULL DEFAULT 'draft',
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrolment" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'active',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT,
    "channel" "Channel" NOT NULL,
    "direction" "MessageDirection" NOT NULL DEFAULT 'outbound',
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "body" TEXT,
    "templateId" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'smartlead',
    "email" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 30,
    "warmupStatus" TEXT NOT NULL DEFAULT 'pending',
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'unipile',
    "type" "Channel" NOT NULL,
    "handle" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "weeklyConnectLimit" INTEGER NOT NULL DEFAULT 80,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "domain" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCost" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IcpProfile_active_idx" ON "IcpProfile"("active");

-- CreateIndex
CREATE UNIQUE INDEX "IcpProfile_name_version_key" ON "IcpProfile"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Company_placeId_key" ON "Company"("placeId");

-- CreateIndex
CREATE INDEX "Company_country_region_idx" ON "Company"("country", "region");

-- CreateIndex
CREATE INDEX "Company_industry_idx" ON "Company"("industry");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_linkedinUrl_key" ON "Contact"("linkedinUrl");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Contact_seniority_idx" ON "Contact"("seniority");

-- CreateIndex
CREATE INDEX "Signal_companyId_type_idx" ON "Signal"("companyId", "type");

-- CreateIndex
CREATE INDEX "Signal_type_detectedAt_idx" ON "Signal"("type", "detectedAt");

-- CreateIndex
CREATE INDEX "Score_tier_composite_idx" ON "Score"("tier", "composite");

-- CreateIndex
CREATE UNIQUE INDEX "Score_contactId_icpProfileId_key" ON "Score"("contactId", "icpProfileId");

-- CreateIndex
CREATE INDEX "Enrolment_status_nextActionAt_idx" ON "Enrolment"("status", "nextActionAt");

-- CreateIndex
CREATE UNIQUE INDEX "Enrolment_contactId_sequenceId_key" ON "Enrolment"("contactId", "sequenceId");

-- CreateIndex
CREATE INDEX "Message_status_idx" ON "Message"("status");

-- CreateIndex
CREATE INDEX "Message_enrolmentId_idx" ON "Message"("enrolmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_externalId_key" ON "Message"("channel", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_email_key" ON "Mailbox"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAccount_provider_type_handle_key" ON "ChannelAccount"("provider", "type", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_email_key" ON "Suppression"("email");

-- CreateIndex
CREATE INDEX "Suppression_domain_idx" ON "Suppression"("domain");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "ProviderCost_provider_at_idx" ON "ProviderCost"("provider", "at");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_icpProfileId_fkey" FOREIGN KEY ("icpProfileId") REFERENCES "IcpProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
