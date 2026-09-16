import { jwtVerify, decodeJwt } from "jose";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;

export async function verifyShopifyIdToken(token: string) {
  if (!token) {
    throw new Error("Missing Shopify ID token");
  }

  // Decode only to determine the destination store.
  // The signature is verified immediately afterward.
  const decoded = decodeJwt(token);

  if (!decoded.dest || typeof decoded.dest !== "string") {
    throw new Error("Invalid Shopify token destination");
  }

  const destUrl = new URL(decoded.dest);

  if (!destUrl.hostname.endsWith(".myshopify.com")) {
    throw new Error("Invalid Shopify store domain");
  }

  const shop = destUrl.hostname;

  const issuer = `https://${shop}/admin`;

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(SHOPIFY_API_SECRET),
    {
      algorithms: ["HS256"],
      audience: SHOPIFY_API_KEY,
      issuer,
    },
  );

  return {
    shop,
    payload,
  };
}