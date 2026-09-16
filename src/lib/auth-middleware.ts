import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { verifyShopifyIdToken } from "./shopify-auth";

type AuthResult =
  | { ok: true; shopDomain: string; shopId: string }
  | { ok: false; error: string; status: number };

export async function authenticateApiRequest(
  request: NextRequest,
): Promise<AuthResult> {
  const shopDomain = request.headers.get("x-shop-domain");

  if (!shopDomain) {
    return { ok: false, error: "Missing x-shop-domain header", status: 400 };
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true, uninstalledAt: true, accessToken: true },
  });

  if (!shop) {
    return { ok: false, error: "Shop not found", status: 401 };
  }

  if (shop.uninstalledAt) {
    return { ok: false, error: "App uninstalled from this shop", status: 403 };
  }

  if (!shop.accessToken) {
    return { ok: false, error: "No access token for this shop", status: 401 };
  }

  return { ok: true, shopDomain, shopId: shop.id };
}

export async function authenticateSessionRequest(
  request: NextRequest,
): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing authorization token", status: 401 };
  }

  const idToken = authHeader.slice("Bearer ".length);

  try {
    const { shop } = await verifyShopifyIdToken(idToken);

    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true, uninstalledAt: true },
    });

    if (!shopRecord) {
      return { ok: false, error: "Shop not found", status: 401 };
    }

    if (shopRecord.uninstalledAt) {
      return { ok: false, error: "App uninstalled", status: 403 };
    }

    return { ok: true, shopDomain: shop, shopId: shopRecord.id };
  } catch {
    return { ok: false, error: "Invalid token", status: 401 };
  }
}
