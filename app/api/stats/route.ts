import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { ImageStatus } from "@/src/generated/prisma/enums";

export async function GET(request: NextRequest) {
  try {
    const shopDomain = request.headers.get("x-shop-domain");

    if (!shopDomain) {
      return NextResponse.json(
        { error: "Missing x-shop-domain header" },
        { status: 400 },
      );
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      return NextResponse.json(
        { error: "Shop not found" },
        { status: 401 },
      );
    }

    const [totalImages, optimized, recommended, highPriority, savingsResult] =
      await Promise.all([
        prisma.image.count({ where: { shopId: shop.id } }),
        prisma.image.count({
          where: { shopId: shop.id, status: ImageStatus.OPTIMIZED },
        }),
        prisma.image.count({
          where: { shopId: shop.id, status: ImageStatus.RECOMMENDED },
        }),
        prisma.image.count({
          where: { shopId: shop.id, status: ImageStatus.HIGH_PRIORITY },
        }),
        prisma.image.aggregate({
          where: {
            shopId: shop.id,
            potentialSavingsBytes: { not: null },
          },
          _sum: { potentialSavingsBytes: true },
        }),
      ]);

    const totalSavingsBytes = savingsResult._sum.potentialSavingsBytes
      ? Number(savingsResult._sum.potentialSavingsBytes)
      : 0;

    const activeScanJob = await prisma.scanJob.findFirst({
      where: {
        shopId: shop.id,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      totalImages,
      optimized,
      recommended,
      highPriority,
      totalSavingsBytes,
      activeScanJob: activeScanJob
        ? {
            id: activeScanJob.id,
            status: activeScanJob.status,
            scanned: activeScanJob.scanned,
            total: activeScanJob.total,
          }
        : null,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
