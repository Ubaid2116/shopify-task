import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";

const TEST_SECRET = "test-shopify-api-secret-key-12345";

function computeHmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("Webhook HMAC verification logic", () => {
  it("computes valid HMAC for a known body", () => {
    const body = '{"shop_domain":"test.myshopify.com","topic":"app/uninstalled"}';
    const hmac = computeHmac(body, TEST_SECRET);
    expect(hmac).toBeTruthy();
    expect(typeof hmac).toBe("string");
    expect(hmac.length).toBeGreaterThan(0);
  });

  it("HMAC is deterministic", () => {
    const body = '{"test":"data"}';
    const hmac1 = computeHmac(body, TEST_SECRET);
    const hmac2 = computeHmac(body, TEST_SECRET);
    expect(hmac1).toBe(hmac2);
  });

  it("different bodies produce different HMACs", () => {
    const hmac1 = computeHmac("body1", TEST_SECRET);
    const hmac2 = computeHmac("body2", TEST_SECRET);
    expect(hmac1).not.toBe(hmac2);
  });

  it("different secrets produce different HMACs", () => {
    const body = "same-body";
    const hmac1 = computeHmac(body, "secret1");
    const hmac2 = computeHmac(body, "secret2");
    expect(hmac1).not.toBe(hmac2);
  });

  it("HMAC verification with timing-safe comparison", () => {
    const body = '{"shop":"test.myshopify.com"}';
    const validHmac = computeHmac(body, TEST_SECRET);

    const computed = createHmac("sha256", TEST_SECRET).update(body, "utf8").digest("base64");
    expect(Buffer.byteLength(computed)).toBe(Buffer.byteLength(validHmac));

    const { timingSafeEqual } = require("crypto");
    const isValid = timingSafeEqual(
      Buffer.from(computed, "base64"),
      Buffer.from(validHmac, "base64"),
    );
    expect(isValid).toBe(true);
  });

  it("rejects invalid HMAC", () => {
    const body = '{"shop":"test.myshopify.com"}';
    const validHmac = computeHmac(body, TEST_SECRET);
    const invalidHmac = computeHmac("wrong-body", TEST_SECRET);

    const computed = createHmac("sha256", TEST_SECRET).update(body, "utf8").digest("base64");
    const { timingSafeEqual } = require("crypto");

    const isValid = timingSafeEqual(
      Buffer.from(computed, "base64"),
      Buffer.from(invalidHmac, "base64"),
    );
    expect(isValid).toBe(false);
  });

  it("handles empty body", () => {
    const hmac = computeHmac("", TEST_SECRET);
    expect(hmac).toBeTruthy();
    expect(hmac.length).toBeGreaterThan(0);
  });

  it("handles unicode body", () => {
    const body = '{"name":"फ़ाइल नाम","emoji":"🖼️"}';
    const hmac = computeHmac(body, TEST_SECRET);
    expect(hmac).toBeTruthy();
  });

  it("detects tampered body", () => {
    const originalBody = '{"shop":"test.myshopify.com","topic":"app/uninstalled"}';
    const tamperedBody = '{"shop":"test.myshopify.com","topic":"products/update"}';
    const originalHmac = computeHmac(originalBody, TEST_SECRET);
    const tamperedHmac = computeHmac(tamperedBody, TEST_SECRET);
    expect(originalHmac).not.toBe(tamperedHmac);
  });
});
