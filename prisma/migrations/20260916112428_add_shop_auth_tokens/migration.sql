-- DropIndex
DROP INDEX "Shop_shopDomain_idx";

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "accessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "refreshTokenExpiresAt" TIMESTAMP(3);
