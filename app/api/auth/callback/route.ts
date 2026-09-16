import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/src/lib/prisma";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;

function verifyHmac(params: URLSearchParams, hmac: string): boolean {
  const paramsForHmac = new URLSearchParams(params);
  paramsForHmac.delete("hmac");
  paramsForHmac.sort();

  const queryStr = paramsForHmac.toString();
  const computedHmac = createHmac("sha256", SHOPIFY_API_SECRET)
    .update(queryStr)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computedHmac, "hex"), Buffer.from(hmac, "hex"));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const shop = params.get("shop");
    const code = params.get("code");
    const hmac = params.get("hmac");
    const state = params.get("state");

    if (!shop || !code || !hmac) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    if (!verifyHmac(params, hmac)) {
      return NextResponse.json(
        { error: "HMAC verification failed" },
        { status: 401 },
      );
    }

    const nonce = request.cookies.get("shopify_auth_nonce")?.value;
    if (state && nonce && state !== nonce) {
      return NextResponse.json(
        { error: "State mismatch - possible CSRF" },
        { status: 401 },
      );
    }

    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: SHOPIFY_API_KEY,
          client_secret: SHOPIFY_API_SECRET,
          code,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("Token exchange failed:", error);
      return NextResponse.json(
        { error: "Token exchange failed" },
        { status: 401 },
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.json(
        { error: "No access token received" },
        { status: 401 },
      );
    }

    const expiresIn =
      typeof tokenData.expires_in === "number" ? tokenData.expires_in : null;
    const refreshTokenExpiresIn =
      typeof tokenData.refresh_token_expires_in === "number"
        ? tokenData.refresh_token_expires_in
        : null;

    await prisma.shop.upsert({
      where: { shopDomain: shop },
      create: {
        shopDomain: shop,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        accessTokenExpiresAt: expiresIn
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
        refreshTokenExpiresAt: refreshTokenExpiresIn
          ? new Date(Date.now() + refreshTokenExpiresIn * 1000)
          : null,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? undefined,
        accessTokenExpiresAt: expiresIn
          ? new Date(Date.now() + expiresIn * 1000)
          : undefined,
        refreshTokenExpiresAt: refreshTokenExpiresIn
          ? new Date(Date.now() + refreshTokenExpiresIn * 1000)
          : undefined,
        uninstalledAt: null,
      },
    });

    const shopParam = encodeURIComponent(shop);
    return NextResponse.redirect(
      `https://${shop}/admin/apps/${SHOPIFY_API_KEY}?shop=${shopParam}`,
    );
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 },
    );
  }
}
