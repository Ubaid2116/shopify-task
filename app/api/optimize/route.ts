import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticateApiRequest } from "@/src/lib/auth-middleware";
import {
  downloadImage,
  optimizeImage,
  convertToWebp,
} from "@/src/lib/image-processor";
import { saveOptimizedImage } from "@/src/lib/optimized-storage";
import { JobStatus } from "@/src/generated/prisma/enums";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { shopId } = auth;
    const body = await request.json();
    const imageId = body?.imageId;

    if (!imageId || typeof imageId !== "string") {
      return NextResponse.json({ error: "Missing or invalid imageId" }, { status: 400 });
    }

    const image = await prisma.image.findFirst({
      where: { id: imageId, shopId },
    });

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const existingJob = await prisma.optimizationJob.findUnique({
      where: { shopId_imageId: { shopId, imageId } },
    });

    if (existingJob?.status === JobStatus.PROCESSING) {
      return NextResponse.json(
        { error: "Optimization already in progress" },
        { status: 409 },
      );
    }

    const optimizationJob = await prisma.optimizationJob.upsert({
      where: { shopId_imageId: { shopId, imageId } },
      create: {
        shopId,
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

      const optimizedPath = await saveOptimizedImage(
        shopId,
        imageId,
        result.buffer,
        result.format,
      );

      await prisma.optimizationJob.update({
        where: { id: optimizationJob.id },
        data: {
          status: JobStatus.COMPLETED,
          originalBytes: BigInt(result.originalBytes),
          optimizedBytes: BigInt(result.optimizedBytes),
          savingsBytes: BigInt(result.savingsBytes),
          reductionPercent: result.reductionPercent,
          optimizedPath,
          completedAt: new Date(),
        },
      });

      await prisma.optimizationResult.create({
        data: {
          shopId,
          imageId,
          optimizationJobId: optimizationJob.id,
          originalBytes: BigInt(result.originalBytes),
          optimizedBytes: BigInt(result.optimizedBytes),
          savingsBytes: BigInt(result.savingsBytes),
          reductionPercent: result.reductionPercent,
          outputFormat: result.format,
          optimizedPath,
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
        optimizedPath,
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
