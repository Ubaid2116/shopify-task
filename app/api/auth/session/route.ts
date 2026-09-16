import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { verifyShopifyIdToken } from "@/src/lib/shopify-auth";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 },
      );
    }

    const idToken = authorization.slice("Bearer ".length);

    console.log("Verifying token for shop...");

    // Verify Shopify's ID token
    const { shop } = await verifyShopifyIdToken(idToken);

    console.log("Token verified, shop:", shop);

    // Exchange ID token for an offline access token
    const response = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.SHOPIFY_API_KEY!,
          client_secret: process.env.SHOPIFY_API_SECRET!,
          grant_type:
            "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: idToken,
          subject_token_type:
            "urn:ietf:params:oauth:token-type:id_token",
          requested_token_type:
            "urn:shopify:params:oauth:token-type:offline-access-token",
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();

      console.error("Shopify token exchange failed:", response.status, error);

      return NextResponse.json(
        { error: "Shopify authentication failed", details: error },
        { status: 401 },
      );
    }

    const tokenData = await response.json();

    if (!tokenData.access_token) {
      return NextResponse.json(
        { error: "Shopify did not return an access token" },
        { status: 401 },
      );
    }

    const expiresIn =
      typeof tokenData.expires_in === "number"
        ? tokenData.expires_in
        : null;

    const refreshTokenExpiresIn =
      typeof tokenData.refresh_token_expires_in === "number"
        ? tokenData.refresh_token_expires_in
        : null;

    // Save/update shop authentication in PostgreSQL
    await prisma.shop.upsert({
      where: {
        shopDomain: shop,
      },
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

    // Never send Shopify access tokens to the browser
    return NextResponse.json({
      authenticated: true,
      shop,
    });
  } catch (error) {
    console.error("Authentication error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Unauthorized", details: message },
      { status: 401 },
    );
  }
}