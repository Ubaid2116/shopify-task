import { describe, it, expect } from "vitest";
import {
  detectFormat,
  isOptimizedFormat,
  classifyImage,
  estimateOptimizedSize,
} from "../src/lib/image-analysis";

describe("detectFormat", () => {
  it("detects format from content-type header", () => {
    expect(detectFormat("https://example.com/img", "image/png")).toBe("image/png");
    expect(detectFormat("https://example.com/img", "image/jpeg")).toBe("image/jpeg");
    expect(detectFormat("https://example.com/img", "image/webp")).toBe("image/webp");
  });

  it("ignores application/octet-stream", () => {
    expect(detectFormat("https://example.com/photo.jpg", "application/octet-stream")).toBe("image/jpeg");
  });

  it("detects format from URL extension", () => {
    expect(detectFormat("https://cdn.shopify.com/photo.jpg", null)).toBe("image/jpeg");
    expect(detectFormat("https://cdn.shopify.com/photo.jpeg", null)).toBe("image/jpeg");
    expect(detectFormat("https://cdn.shopify.com/photo.png", null)).toBe("image/png");
    expect(detectFormat("https://cdn.shopify.com/photo.webp", null)).toBe("image/webp");
    expect(detectFormat("https://cdn.shopify.com/photo.avif", null)).toBe("image/avif");
    expect(detectFormat("https://cdn.shopify.com/photo.gif", null)).toBe("image/gif");
    expect(detectFormat("https://cdn.shopify.com/photo.svg", null)).toBe("image/svg+xml");
  });

  it("strips query params before detecting extension", () => {
    expect(detectFormat("https://example.com/photo.jpg?width=300&height=200", null)).toBe("image/jpeg");
  });

  it("defaults to jpeg for unknown extensions", () => {
    expect(detectFormat("https://example.com/photo", null)).toBe("image/jpeg");
  });
});

describe("isOptimizedFormat", () => {
  it("returns true for webp", () => {
    expect(isOptimizedFormat("image/webp")).toBe(true);
  });

  it("returns true for avif", () => {
    expect(isOptimizedFormat("image/avif")).toBe(true);
  });

  it("returns false for jpeg", () => {
    expect(isOptimizedFormat("image/jpeg")).toBe(false);
  });

  it("returns false for png", () => {
    expect(isOptimizedFormat("image/png")).toBe(false);
  });

  it("returns false for gif", () => {
    expect(isOptimizedFormat("image/gif")).toBe(false);
  });
});

describe("classifyImage", () => {
  it("returns OPTIMIZED for webp format", () => {
    expect(classifyImage("image/webp", 500000)).toBe("OPTIMIZED");
  });

  it("returns OPTIMIZED for avif format", () => {
    expect(classifyImage("image/avif", 500000)).toBe("OPTIMIZED");
  });

  it("returns OPTIMIZED for small images under 200KB", () => {
    expect(classifyImage("image/jpeg", 100 * 1024)).toBe("OPTIMIZED");
  });

  it("returns OPTIMIZED for exactly 200KB", () => {
    expect(classifyImage("image/jpeg", 200 * 1024)).toBe("OPTIMIZED");
  });

  it("returns RECOMMENDED for images between 200KB and 1MB", () => {
    expect(classifyImage("image/jpeg", 500 * 1024)).toBe("RECOMMENDED");
  });

  it("returns HIGH_PRIORITY for images over 1MB", () => {
    expect(classifyImage("image/jpeg", 1.5 * 1024 * 1024)).toBe("HIGH_PRIORITY");
  });

  it("returns HIGH_PRIORITY for very large images", () => {
    expect(classifyImage("image/png", 5 * 1024 * 1024)).toBe("HIGH_PRIORITY");
  });

  it("returns RECOMMENDED when size is unknown", () => {
    expect(classifyImage("image/jpeg", null)).toBe("RECOMMENDED");
  });
});

describe("estimateOptimizedSize", () => {
  it("returns null for null size", () => {
    const result = estimateOptimizedSize("image/jpeg", null);
    expect(result.estimatedBytes).toBeNull();
    expect(result.savingsBytes).toBeNull();
    expect(result.reductionPercent).toBeNull();
  });

  it("returns null for zero size", () => {
    const result = estimateOptimizedSize("image/jpeg", 0);
    expect(result.estimatedBytes).toBeNull();
    expect(result.savingsBytes).toBeNull();
    expect(result.reductionPercent).toBeNull();
  });

  it("returns zero savings for already optimized format", () => {
    const result = estimateOptimizedSize("image/webp", 500000);
    expect(result.estimatedBytes).toBe(500000);
    expect(result.savingsBytes).toBe(0);
    expect(result.reductionPercent).toBe(0);
  });

  it("estimates 35% reduction for jpeg (65% ratio)", () => {
    const result = estimateOptimizedSize("image/jpeg", 1000000);
    expect(result.estimatedBytes).toBe(650000);
    expect(result.savingsBytes).toBe(350000);
    expect(result.reductionPercent).toBe(35);
  });

  it("estimates 50% reduction for png", () => {
    const result = estimateOptimizedSize("image/png", 1000000);
    expect(result.estimatedBytes).toBe(500000);
    expect(result.savingsBytes).toBe(500000);
    expect(result.reductionPercent).toBe(50);
  });

  it("uses default 65% ratio for unknown formats", () => {
    const result = estimateOptimizedSize("image/bmp", 1000000);
    expect(result.estimatedBytes).toBe(350000);
    expect(result.savingsBytes).toBe(650000);
    expect(result.reductionPercent).toBe(65);
  });
});
