-- CreateEnum
CREATE TYPE "CommunicationPreference" AS ENUM ('email_only', 'sms_only', 'both', 'transactional_only');

-- AlterTable
ALTER TABLE "guests" ADD COLUMN "communication_preference" "CommunicationPreference" NOT NULL DEFAULT 'both';
