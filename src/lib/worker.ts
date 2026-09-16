import { Job } from "bullmq";
import { prisma } from "./prisma";
import { createWorker, QueueJobData } from "./queue";
import {
  downloadImage,
  optimizeImage,
  convertToWebp,
} from "./image-processor";
import { JobStatus } from "../generated/prisma/enums";

async function processOptimizationJob(job: Job<QueueJobData>) {
  if (job.data.type !== "optimize") {
    console.log(`Skipping non-optimize job: ${job.data.type}`);
    return;
  }

  const { shopId, imageId } = job.data;

  console.log(`Processing optimization: shop=${shopId} image=${imageId}`);

  const image = await prisma.image.findUnique({ where: { id: imageId } });
  if (!image) {
    console.error(`Image not found: ${imageId}`);
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

    await prisma.optimizationJob.update({
      where: { shopId_imageId: { shopId, imageId } },
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

const worker = createWorker(processOptimizationJob);

worker.on("completed", (job) => {
  if ("imageId" in job.data) {
    console.log(`Job ${job.id} completed for image ${job.data.imageId}`);
  }
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Optimization worker started. Waiting for jobs...");

process.on("SIGTERM", async () => {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
});
