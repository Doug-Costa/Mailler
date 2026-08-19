-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "openedEmails" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RecipientLog" ADD COLUMN     "opened" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openedAt" TIMESTAMP(3);
