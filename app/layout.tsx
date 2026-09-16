import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoreBoost Pro",
  description: "Shopify Image Optimization & Performance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta
          name="shopify-api-key"
          content={process.env.SHOPIFY_API_KEY ?? ""}
        />

        <Script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          strategy="beforeInteractive"
        />

        <Script
          src="https://cdn.shopify.com/shopifycloud/polaris-1.js"
          strategy="beforeInteractive"
        />
      </head>

      <body>{children}</body>
    </html>
  );
}