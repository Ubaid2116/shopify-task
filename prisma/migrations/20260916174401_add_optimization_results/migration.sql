-- CreateTable
CREATE TABLE "OptimizationResult" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "optimizationJobId" TEXT NOT NULL,
    "originalBytes" BIGINT NOT NULL,
    "optimizedBytes" BIGINT NOT NULL,
    "savingsBytes" BIGINT NOT NULL,
    "reductionPercent" DOUBLE PRECISION NOT NULL,
    "outputFormat" TEXT NOT NULL,
    "optimizedPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OptimizationResult_shopId_idx" ON "OptimizationResult"("shopId");

-- CreateIndex
CREATE INDEX "OptimizationResult_imageId_idx" ON "OptimizationResult"("imageId");

-- AddForeignKey
ALTER TABLE "OptimizationResult" ADD CONSTRAINT "OptimizationResult_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationResult" ADD CONSTRAINT "OptimizationResult_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationResult" ADD CONSTRAINT "OptimizationResult_optimizationJobId_fkey" FOREIGN KEY ("optimizationJobId") REFERENCES "OptimizationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
