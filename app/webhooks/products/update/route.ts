import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/src/lib/prisma";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;

function verifyShopifyHmac(body: string, hmacHeader: string): boolean {
  const hmac = createHmac("sha256", SHOPIFY_API_SECRET);
  hmac.update(body, "utf8");
  const digest = hmac.digest("base64");

  try {
    return timingSafeEqual(
      Buffer.from(digest, "base64"),
      Buffer.from(hmacHeader, "base64"),
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const shopDomain = request.headers.get("x-shopify-shop-domain");
    const topic = request.headers.get("x-shopify-topic");

    if (!hmacHeader || !shopDomain) {
      return NextResponse.json({ error: "Missing headers" }, { status: 400 });
    }

    const body = await request.text();

    if (!verifyShopifyHmac(body, hmacHeader)) {
      return NextResponse.json({ error: "HMAC failed" }, { status: 401 });
    }

    console.log(`Webhook received: ${topic} from ${shopDomain}`);

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!shop) {
      console.error(`Shop not found for webhook: ${shopDomain}`);
      return NextResponse.json({ received: true });
    }

    console.log(`Product updated for ${shopDomain} - scan will pick up new products on next manual scan`);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
