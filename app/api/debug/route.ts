import { NextResponse } from "next/server";
import { createQueue } from "@/src/lib/queue";
import { redis } from "@/src/lib/redis";

export async function GET() {
  const debug: Record<string, unknown> = {};

  try {
    // Test Redis connection
    const pong = await redis.ping();
    debug.redis = pong;

    // Test queue creation and add
    const queue = createQueue();
    const testJob = await queue.add(
      "test",
      { type: "scan" as const, shopId: "test", shopDomain: "test.com" },
      { jobId: `test-${Date.now()}`, removeOnComplete: true, removeOnFail: true }
    );
    debug.testJobAdded = testJob.id;

    // Check queue state
    const waiting = await redis.lrange("bull:storeboost:waiting", 0, -1);
    debug.waitingJobs = waiting;

    await queue.close();

    return NextResponse.json({ ok: true, debug });
  } catch (error) {
    debug.error = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, debug }, { status: 500 });
  }
}
