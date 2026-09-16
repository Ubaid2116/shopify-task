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

async function handleAppUninstalled(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (shop) {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { uninstalledAt: new Date() },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const topic = request.headers.get("x-shopify-topic");
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const shopDomain = request.headers.get("x-shopify-shop-domain");

    if (!hmacHeader || !shopDomain || !topic) {
      return NextResponse.json(
        { error: "Missing required headers" },
        { status: 400 },
      );
    }

    const body = await request.text();

    if (!verifyShopifyHmac(body, hmacHeader)) {
      console.error(`Webhook HMAC verification failed for shop: ${shopDomain}`);
      return NextResponse.json(
        { error: "HMAC verification failed" },
        { status: 401 },
      );
    }

    console.log(`Webhook received: ${topic} from ${shopDomain}`);

    switch (topic) {
      case "app/uninstalled":
        await handleAppUninstalled(shopDomain);
        break;
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
