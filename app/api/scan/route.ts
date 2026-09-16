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
        status: JobStatus.QUEUED,
        startedAt: new Date(),
      },
    });

    await queue.add(
      "scan",
      {
        type: "scan",
        shopId,
        shopDomain,
      },
      {
        jobId: `scan-${shopId}-${scanJob.id}`,
      },
    );

    return NextResponse.json({
      scanJobId: scanJob.id,
      status: "queued",
      message: "Scan queued for background processing",
    });
  } catch (error) {
    console.error("Scan error:", error);
    const message = error instanceof Error ? error.message : "Scan failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
