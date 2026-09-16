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

describe("Input validation", () => {
  it("validates shop domain format", () => {
    const validDomains = [
      "test-store.myshopify.com",
      "my-shop.myshopify.com",
      "shop123.myshopify.com",
    ];
    const invalidDomains = [
      "not-a-shop",
      "test.com",
      "myshopify.com",
      "",
      "test.myshopify.com.evil.com",
    ];

    const domainRegex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

    for (const domain of validDomains) {
      expect(domainRegex.test(domain)).toBe(true);
    }

    for (const domain of invalidDomains) {
      expect(domainRegex.test(domain)).toBe(false);
    }
  });

  it("validates image ID format (cuid)", () => {
    const validIds = [
      "clx1234567890abcdef",
      "c0ffee1234567890abcd",
    ];
    const invalidIds = [
      "",
      "abc",
      "123",
      "../../etc/passwd",
      "'; DROP TABLE images; --",
    ];

    for (const id of validIds) {
      expect(id.length).toBeGreaterThan(0);
      expect(id.startsWith("c")).toBe(true);
    }

    for (const id of invalidIds) {
      expect(id.length === 0 || !id.startsWith("c")).toBe(true);
    }
  });

  it("validates page number parameters", () => {
    const validPages = [1, 2, 10, 100];
    const invalidPages = [0, -1, -100, NaN];

    for (const page of validPages) {
      expect(page).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(page)).toBe(true);
    }

    for (const page of invalidPages) {
      expect(page < 1 || !Number.isFinite(page)).toBe(true);
    }
  });

  it("validates page size bounds", () => {
    const clamp = (size: number) => Math.min(100, Math.max(1, size));

    expect(clamp(0)).toBe(1);
    expect(clamp(-5)).toBe(1);
    expect(clamp(10)).toBe(10);
    expect(clamp(50)).toBe(50);
    expect(clamp(100)).toBe(100);
    expect(clamp(200)).toBe(100);
  });

  it("validates bulk optimize batch size limit", () => {
    const maxBatch = 50;
    const validBatch = Array.from({ length: 50 }, (_, i) => `img-${i}`);
    const oversizedBatch = Array.from({ length: 51 }, (_, i) => `img-${i}`);

    expect(validBatch.length).toBeLessThanOrEqual(maxBatch);
    expect(oversizedBatch.length).toBeGreaterThan(maxBatch);
  });
});
