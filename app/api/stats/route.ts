import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticateApiRequest } from "@/src/lib/auth-middleware";
import { ImageStatus } from "@/src/generated/prisma/enums";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { shopId } = auth;

    const [totalImages, optimized, recommended, highPriority, failed, savingsResult, activeJobs] =
      await Promise.all([
        prisma.image.count({ where: { shopId } }),
        prisma.image.count({
          where: { shopId, status: ImageStatus.OPTIMIZED },
        }),
        prisma.image.count({
          where: { shopId, status: ImageStatus.RECOMMENDED },
        }),
        prisma.image.count({
          where: { shopId, status: ImageStatus.HIGH_PRIORITY },
        }),
        prisma.image.count({
          where: { shopId, status: ImageStatus.FAILED },
        }),
        prisma.image.aggregate({
          where: {
            shopId,
            potentialSavingsBytes: { not: null },
          },
          _sum: { potentialSavingsBytes: true },
        }),
        prisma.optimizationJob.findMany({
          where: {
            shopId,
            status: { in: ["QUEUED", "PROCESSING"] },
          },
          select: {
            id: true,
            status: true,
            imageId: true,
            createdAt: true,
          },
        }),
      ]);

    const totalSavingsBytes = savingsResult._sum.potentialSavingsBytes
      ? Number(savingsResult._sum.potentialSavingsBytes)
      : 0;

    const activeScanJob = await prisma.scanJob.findFirst({
      where: {
        shopId,
        status: { in: ["QUEUED", "PROCESSING", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      totalImages,
      optimized,
      recommended,
      highPriority,
      failed,
      totalSavingsBytes,
      activeScanJob: activeScanJob
        ? {
            id: activeScanJob.id,
            status: activeScanJob.status,
            scanned: activeScanJob.scanned,
            total: activeScanJob.total,
            error: activeScanJob.error,
          }
        : null,
      activeOptimizationJobs: activeJobs.length,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
