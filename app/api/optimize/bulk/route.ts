import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { authenticateApiRequest } from "@/src/lib/auth-middleware";
import { createQueue } from "@/src/lib/queue";
import { JobStatus } from "@/src/generated/prisma/enums";

const queue = createQueue();

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { shopId } = auth;
    const body = await request.json();
    const imageIds = body?.imageIds;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid imageIds array" },
        { status: 400 },
      );
    }

    if (imageIds.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 images per batch" },
        { status: 400 },
      );
    }

    const images = await prisma.image.findMany({
      where: {
        id: { in: imageIds },
        shopId,
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
        where: { shopId_imageId: { shopId, imageId: image.id } },
      });

      if (existingJob && existingJob.status === JobStatus.PROCESSING) {
        skipped.push(image.id);
        continue;
      }

      await prisma.optimizationJob.upsert({
        where: {
          shopId_imageId: { shopId, imageId: image.id },
        },
        create: {
          shopId,
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
          shopId,
          imageId: image.id,
        },
        {
          jobId: `optimize-${shopId}-${image.id}`,
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
