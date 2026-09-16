-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('OPTIMIZED', 'RECOMMENDED', 'HIGH_PRIORITY', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyImageId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT,
    "originalBytes" BIGINT,
    "estimatedOptimizedBytes" BIGINT,
    "potentialSavingsBytes" BIGINT,
    "reductionPercent" DOUBLE PRECISION,
    "status" "ImageStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "originalBytes" BIGINT,
    "optimizedBytes" BIGINT,
    "savingsBytes" BIGINT,
    "reductionPercent" DOUBLE PRECISION,
    "optimizedPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OptimizationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Shop_shopDomain_idx" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Image_shopId_idx" ON "Image"("shopId");

-- CreateIndex
CREATE INDEX "Image_shopId_status_idx" ON "Image"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Image_shopId_shopifyImageId_key" ON "Image"("shopId", "shopifyImageId");

-- CreateIndex
CREATE INDEX "ScanJob_shopId_status_idx" ON "ScanJob"("shopId", "status");

-- CreateIndex
CREATE INDEX "OptimizationJob_shopId_status_idx" ON "OptimizationJob"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationJob_shopId_imageId_key" ON "OptimizationJob"("shopId", "imageId");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanJob" ADD CONSTRAINT "ScanJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationJob" ADD CONSTRAINT "OptimizationJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationJob" ADD CONSTRAINT "OptimizationJob_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;
