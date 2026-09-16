import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { ImageStatus } from "@/src/generated/prisma/enums";

export async function GET(request: NextRequest) {
  try {
    const shopDomain = request.headers.get("x-shop-domain");
    const status = request.nextUrl.searchParams.get("status");
    const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(
      request.nextUrl.searchParams.get("pageSize") ?? "20",
      10,
    );
    const search = request.nextUrl.searchParams.get("search") ?? "";

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

    const where: Record<string, unknown> = { shopId: shop.id };

    if (status && status !== "ALL") {
      where.status = status as ImageStatus;
    }

    if (search) {
      where.productName = { contains: search, mode: "insensitive" };
    }

    const [images, total] = await Promise.all([
      prisma.image.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.image.count({ where }),
    ]);

    return NextResponse.json({
      images: images.map((img) => ({
        id: img.id,
        shopifyProductId: img.shopifyProductId,
        shopifyImageId: img.shopifyImageId,
        productName: img.productName,
        sourceUrl: img.sourceUrl,
        width: img.width,
        height: img.height,
        format: img.format,
        originalBytes: img.originalBytes ? Number(img.originalBytes) : null,
        estimatedOptimizedBytes: img.estimatedOptimizedBytes
          ? Number(img.estimatedOptimizedBytes)
          : null,
        potentialSavingsBytes: img.potentialSavingsBytes
          ? Number(img.potentialSavingsBytes)
          : null,
        reductionPercent: img.reductionPercent,
        status: img.status,
        createdAt: img.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Images error:", error);
    return NextResponse.json(
      { error: "Failed to fetch images" },
      { status: 500 },
    );
  }
}
