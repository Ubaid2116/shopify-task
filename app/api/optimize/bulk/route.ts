import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { createQueue } from "@/src/lib/queue";
import { JobStatus } from "@/src/generated/prisma/enums";

const queue = createQueue();

export async function POST(request: NextRequest) {
  try {
    const shopDomain = request.headers.get("x-shop-domain");
    const { imageIds } = await request.json();

    if (!shopDomain || !Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { error: "Missing shop-domain header or imageIds array" },
        { status: 400 },
      );
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 401 });
    }

    const images = await prisma.image.findMany({
      where: {
        id: { in: imageIds },
        shopId: shop.id,
      },
    });

    if (images.length === 0) {
      return NextResponse.json(
        { error: "No valid images found" },
        { status: 404 },
      );
    }

    const enqueued: string[] = [];
    const skipped: string[] = [];

    for (const image of images) {
      const existingJob = await prisma.optimizationJob.findUnique({
        where: { shopId_imageId: { shopId: shop.id, imageId: image.id } },
      });

      if (existingJob && existingJob.status === JobStatus.PROCESSING) {
        skipped.push(image.id);
        continue;
      }

      await prisma.optimizationJob.upsert({
        where: {
          shopId_imageId: { shopId: shop.id, imageId: image.id },
        },
        create: {
          shopId: shop.id,
          imageId: image.id,
          status: JobStatus.QUEUED,
          attempts: 0,
        },
        update: {
          status: JobStatus.QUEUED,
          error: null,
          startedAt: null,
          completedAt: null,
        },
      });

      await queue.add(
        "optimize",
        {
          type: "optimize",
          shopId: shop.id,
          imageId: image.id,
        },
        {
          jobId: `optimize-${shop.id}-${image.id}`,
        },
      );

      enqueued.push(image.id);
    }

    return NextResponse.json({
      enqueued: enqueued.length,
      skipped: skipped.length,
      total: imageIds.length,
    });
  } catch (error) {
    console.error("Bulk optimize error:", error);
    return NextResponse.json(
      { error: "Bulk optimization failed" },
      { status: 500 },
    );
  }
}
