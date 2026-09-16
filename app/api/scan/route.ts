import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticateApiRequest } from "@/src/lib/auth-middleware";
import { JobStatus } from "@/src/generated/prisma/enums";
import { fetchAllProducts, fetchImageFileSize } from "@/src/lib/shopify-api";
import { detectFormat, classifyImage, estimateOptimizedSize } from "@/src/lib/image-analysis";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { shopDomain, shopId } = auth;

    const existingJob = await prisma.scanJob.findFirst({
      where: {
        shopId,
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
        shopId,
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
      },
    });

    console.log(`[Scan] Starting scan for ${shopDomain} (job: ${scanJob.id})`);

    try {
      const products = await fetchAllProducts(shopDomain);
      const totalProductImages = products.reduce((sum, p) => sum + p.images.length, 0);

      console.log(`[Scan] Found ${products.length} products, ${totalProductImages} images`);

      await prisma.scanJob.update({
        where: { id: scanJob.id },
        data: { total: totalProductImages },
      });

      let scanned = 0;

      for (const product of products) {
        for (const img of product.images) {
          scanned++;

          const { size, contentType } = await fetchImageFileSize(img.url);
          const format = detectFormat(img.url, contentType);
          const status = classifyImage(format, size);
          const { estimatedBytes, savingsBytes, reductionPercent } =
            estimateOptimizedSize(format, size);

          const existingImage = await prisma.image.findUnique({
            where: {
              shopId_shopifyImageId: {
                shopId,
                shopifyImageId: img.shopifyImageId,
              },
            },
            select: { status: true },
          });

          const newStatus =
            existingImage?.status === "OPTIMIZED" ? "OPTIMIZED" : status;

          await prisma.image.upsert({
            where: {
              shopId_shopifyImageId: {
                shopId,
                shopifyImageId: img.shopifyImageId,
              },
            },
            create: {
              shopId,
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
              status: newStatus,
            },
          });

          await prisma.scanJob.update({
            where: { id: scanJob.id },
            data: { scanned },
          });
        }
      }

      await prisma.scanJob.update({
        where: { id: scanJob.id },
        data: {
          status: JobStatus.COMPLETED,
          scanned: totalProductImages,
          total: totalProductImages,
          completedAt: new Date(),
        },
      });

      console.log(`[Scan] Completed: ${products.length} products, ${totalProductImages} images`);

      return NextResponse.json({
        scanJobId: scanJob.id,
        status: "completed",
        message: `Scanned ${products.length} products, ${totalProductImages} images`,
        products: products.length,
        images: totalProductImages,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed";
      console.error(`[Scan] Failed:`, error);

      await prisma.scanJob.update({
        where: { id: scanJob.id },
        data: {
          status: JobStatus.FAILED,
          error: message,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    console.error("[Scan] Error:", error);
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
