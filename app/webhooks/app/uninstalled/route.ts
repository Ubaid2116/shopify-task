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

    if (!hmacHeader || !shopDomain) {
      return NextResponse.json({ error: "Missing headers" }, { status: 400 });
    }

    const body = await request.text();

    if (!verifyShopifyHmac(body, hmacHeader)) {
      return NextResponse.json({ error: "HMAC failed" }, { status: 401 });
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (shop) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { uninstalledAt: new Date() },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
