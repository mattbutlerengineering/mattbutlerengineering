-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'READY');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "cancellation_note" TEXT,
ADD COLUMN     "cancellation_reason" TEXT;

-- AlterTable
ALTER TABLE "tables" ADD COLUMN     "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE';
