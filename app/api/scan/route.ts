import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { fetchAllProducts, fetchImageFileSize } from "@/src/lib/shopify-api";
import {
  detectFormat,
  classifyImage,
  estimateOptimizedSize,
} from "@/src/lib/image-analysis";
import { JobStatus } from "@/src/generated/prisma/enums";

export async function POST(request: NextRequest) {
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

    if (!shop || shop.uninstalledAt) {
      return NextResponse.json(
        { error: "Shop not found or uninstalled" },
        { status: 401 },
      );
    }

    const existingJob = await prisma.scanJob.findFirst({
      where: {
        shopId: shop.id,
        status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] },
      },
    });

    if (existingJob) {
      return NextResponse.json(
        { error: "Scan already in progress", scanJobId: existingJob.id },
        { status: 409 },
      );
    }

    const scanJob = await prisma.scanJob.create({
      data: {
        shopId: shop.id,
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
      },
    });

    const products = await fetchAllProducts(shopDomain);

    let totalImages = 0;

    for (const product of products) {
      for (const img of product.images) {
        totalImages++;

        const { size, contentType } = await fetchImageFileSize(img.url);
        const format = detectFormat(img.url, contentType);
        const status = classifyImage(format, size);
        const { estimatedBytes, savingsBytes, reductionPercent } =
          estimateOptimizedSize(format, size);

        await prisma.image.upsert({
          where: {
            shopId_shopifyImageId: {
              shopId: shop.id,
              shopifyImageId: img.shopifyImageId,
            },
          },
          create: {
            shopId: shop.id,
            shopifyProductId: product.shopifyProductId,
            shopifyImageId: img.shopifyImageId,
            productName: product.title,
            sourceUrl: img.url,
            width: img.width,
            height: img.height,
            format,
            originalBytes: size ? BigInt(size) : null,
            estimatedOptimizedBytes: estimatedBytes
              ? BigInt(estimatedBytes)
              : null,
            potentialSavingsBytes: savingsBytes ? BigInt(savingsBytes) : null,
            reductionPercent,
            status,
          },
          update: {
            productName: product.title,
            sourceUrl: img.url,
            width: img.width,
            height: img.height,
            format,
            originalBytes: size ? BigInt(size) : null,
            estimatedOptimizedBytes: estimatedBytes
              ? BigInt(estimatedBytes)
              : null,
            potentialSavingsBytes: savingsBytes ? BigInt(savingsBytes) : null,
            reductionPercent,
            status,
          },
        });

        await prisma.scanJob.update({
          where: { id: scanJob.id },
          data: { scanned: totalImages, total: totalImages },
        });
      }
    }

    await prisma.scanJob.update({
      where: { id: scanJob.id },
      data: {
        status: JobStatus.COMPLETED,
        scanned: totalImages,
        total: totalImages,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      scanJobId: scanJob.id,
      productsFound: products.length,
      imagesFound: totalImages,
    });
  } catch (error) {
    console.error("Scan error:", error);
    const message = error instanceof Error ? error.message : "Scan failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
