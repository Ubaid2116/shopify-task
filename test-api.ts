import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(".env.local") });

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: "storeboost-pro-dev-store.myshopify.com" },
  });
  if (shop) {
    console.log("Shop found:", shop.shopDomain);
    console.log("Token starts with:", shop.accessToken.substring(0, 15) + "...");

    const restRes = await fetch(
      "https://storeboost-pro-dev-store.myshopify.com/admin/api/2026-07/products.json?limit=1",
      { headers: { "X-Shopify-Access-Token": shop.accessToken } }
    );
    console.log("REST products status:", restRes.status);
    if (restRes.ok) {
      const data = await restRes.json();
      console.log("Products count:", data.products?.length);
    } else {
      console.log("Error:", await restRes.text());
    }
  } else {
    console.log("No shop found");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
