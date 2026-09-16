import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_SCOPES = "read_products,write_products";

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
  }

  const sanitizedShop = shop.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  const shopDomain = sanitizedShop.includes(".myshopify.com")
    ? sanitizedShop
    : `${sanitizedShop}.myshopify.com`;

  const nonce = generateNonce();
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/auth/callback`;
  const baseUrl = `https://${shopDomain}`;

  const authUrl = new URL(`${baseUrl}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", SHOPIFY_API_KEY);
  authUrl.searchParams.set("scope", SHOPIFY_SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", nonce);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("shopify_auth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
