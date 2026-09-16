import { NextRequest, NextResponse } from "next/server";
import { getOptimizedImage } from "@/src/lib/optimized-storage";
import { prisma } from "@/src/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const imageId = request.nextUrl.searchParams.get("imageId");

    if (!imageId) {
      return NextResponse.json({ error: "Missing imageId" }, { status: 400 });
    }

    const result = await prisma.optimizationResult.findFirst({
      where: {
        shopId,
        imageId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!result) {
      return NextResponse.json({ error: "Optimized image not found" }, { status: 404 });
    }

    const buffer = await getOptimizedImage(result.optimizedPath);
    if (!buffer) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const extension = result.outputFormat.replace("image/", "");
    const contentTypes: Record<string, string> = {
      webp: "image/webp",
      avif: "image/avif",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      png: "image/png",
    };

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving optimized image:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
