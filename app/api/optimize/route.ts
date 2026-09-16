import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import {
  downloadImage,
  optimizeImage,
  convertToWebp,
} from "@/src/lib/image-processor";
import { JobStatus } from "@/src/generated/prisma/enums";

export async function POST(request: NextRequest) {
  try {
    const shopDomain = request.headers.get("x-shop-domain");
    const { imageId } = await request.json();

    if (!shopDomain || !imageId) {
      return NextResponse.json(
        { error: "Missing shop-domain header or imageId" },
        { status: 400 },
      );
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 401 });
    }

    const image = await prisma.image.findFirst({
      where: { id: imageId, shopId: shop.id },
    });

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const existingJob = await prisma.optimizationJob.findUnique({
      where: { shopId_imageId: { shopId: shop.id, imageId } },
    });

    if (
      existingJob &&
      (existingJob.status === JobStatus.PROCESSING)
    ) {
      return NextResponse.json(
        { error: "Optimization already in progress" },
        { status: 409 },
      );
    }

    const optimizationJob = await prisma.optimizationJob.upsert({
      where: { shopId_imageId: { shopId: shop.id, imageId } },
      create: {
        shopId: shop.id,
        imageId,
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
        attempts: 1,
      },
      update: {
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
        error: null,
        attempts: { increment: 1 },
      },
    });

    try {
      const imageBuffer = await downloadImage(image.sourceUrl);
      const isWebp = image.format === "image/webp";
      const result = isWebp
        ? await convertToWebp(imageBuffer)
        : await optimizeImage(imageBuffer, image.format ?? "image/jpeg");

      await prisma.optimizationJob.update({
        where: { id: optimizationJob.id },
        data: {
          status: JobStatus.COMPLETED,
          originalBytes: BigInt(result.originalBytes),
          optimizedBytes: BigInt(result.optimizedBytes),
          savingsBytes: BigInt(result.savingsBytes),
          reductionPercent: result.reductionPercent,
          completedAt: new Date(),
        },
      });

      await prisma.image.update({
        where: { id: imageId },
        data: { status: "OPTIMIZED" },
      });

      return NextResponse.json({
        jobId: optimizationJob.id,
        originalBytes: result.originalBytes,
        optimizedBytes: result.optimizedBytes,
        savingsBytes: result.savingsBytes,
        reductionPercent: result.reductionPercent,
      });
    } catch (processingError) {
      const message =
        processingError instanceof Error
          ? processingError.message
          : "Processing failed";

      await prisma.optimizationJob.update({
        where: { id: optimizationJob.id },
        data: {
          status: JobStatus.FAILED,
          error: message,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    console.error("Optimize error:", error);
    return NextResponse.json(
      { error: "Optimization failed" },
      { status: 500 },
    );
  }
}
