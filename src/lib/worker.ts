import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../.env.local") });

import { Job } from "bullmq";
import { prisma } from "./prisma";
import { createWorker, QueueJobData } from "./queue";
import {
  downloadImage,
  optimizeImage,
  convertToWebp,
} from "./image-processor";
import { saveOptimizedImage } from "./optimized-storage";
import { fetchAllProducts, fetchImageFileSize } from "./shopify-api";
import {
  detectFormat,
  classifyImage,
  estimateOptimizedSize,
} from "./image-analysis";
import { JobStatus } from "../generated/prisma/enums";

async function processOptimizationJob(job: Job<QueueJobData>) {
  if (job.data.type !== "optimize") return;

  const { shopId, imageId } = job.data;

  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image) {
    console.error(`Image not found: ${imageId}`);
    return;
  }

  if (image.status === "OPTIMIZED") {
    console.log(`Image ${imageId} already optimized, skipping`);
    return;
  }

  const existingJob = await prisma.optimizationJob.findUnique({
    where: { shopId_imageId: { shopId, imageId } },
  });

  if (existingJob?.status === JobStatus.COMPLETED) {
    console.log(`Optimization already completed for ${imageId}, skipping`);
    return;
  }

  await prisma.optimizationJob.update({
    where: { shopId_imageId: { shopId, imageId } },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
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
      where: { shopId_imageId: { shopId, imageId } },
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
        optimizationJobId: existingJob?.id ?? "",
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

    console.log(
      `Optimized: ${imageId} - ${result.originalBytes} -> ${result.optimizedBytes} bytes (${result.reductionPercent}% savings)`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Processing failed";

    await prisma.optimizationJob.update({
      where: { shopId_imageId: { shopId, imageId } },
      data: {
        status: JobStatus.FAILED,
        error: message,
        completedAt: new Date(),
      },
    });

    console.error(`Failed to optimize ${imageId}: ${message}`);
    throw error;
  }
}

async function processScanJob(job: Job<QueueJobData>) {
  if (job.data.type !== "scan") return;

  const { shopId, shopDomain } = job.data;

  const scanJob = await prisma.scanJob.findFirst({
    where: {
      shopId,
      status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] },
    },
  });

  if (!scanJob) {
    console.error(`No active scan job found for shop ${shopId}`);
    return;
  }

  try {
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

    console.log(
      `Scan completed for ${shopDomain}: ${products.length} products, ${totalImages} images`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scan failed";

    await prisma.scanJob.update({
      where: { id: scanJob.id },
      data: {
        status: JobStatus.FAILED,
        error: message,
        completedAt: new Date(),
      },
    });

    console.error(`Scan failed for ${shopDomain}: ${message}`);
    throw error;
  }
}

async function processJob(job: Job<QueueJobData>) {
  switch (job.data.type) {
    case "optimize":
      return processOptimizationJob(job);
    case "scan":
      return processScanJob(job);
    default:
      console.error(`Unknown job type: ${(job.data as { type: string }).type}`);
  }
}

const worker = createWorker(processJob);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed: ${job.data.type}`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Worker started. Waiting for jobs...");

process.on("SIGTERM", async () => {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
});
