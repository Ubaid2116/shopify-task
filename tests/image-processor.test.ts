import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { optimizeImage, convertToWebp } from "../src/lib/image-processor";

async function createTestJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 128, b: 0 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
}

async function createTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 128, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function createTestWebp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 200, b: 100 },
    },
  })
    .webp()
    .toBuffer();
}

describe("optimizeImage", () => {
  it("optimizes a JPEG image", async () => {
    const jpegBuffer = await createTestJpeg(800, 600);
    const result = await optimizeImage(jpegBuffer, "image/jpeg");

    expect(result.originalBytes).toBe(jpegBuffer.length);
    expect(result.optimizedBytes).toBeGreaterThan(0);
    expect(result.savingsBytes).toBeGreaterThanOrEqual(0);
    expect(result.reductionPercent).toBeGreaterThanOrEqual(0);
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("optimizes a PNG image", async () => {
    const pngBuffer = await createTestPng(800, 600);
    const result = await optimizeImage(pngBuffer, "image/png");

    expect(result.originalBytes).toBe(pngBuffer.length);
    expect(result.optimizedBytes).toBeGreaterThan(0);
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("handles unknown format by converting to webp", async () => {
    const buffer = await createTestJpeg(400, 300);
    const result = await optimizeImage(buffer, "image/bmp");

    expect(result.originalBytes).toBe(buffer.length);
    expect(result.optimizedBytes).toBeGreaterThan(0);
    expect(result.format).toBe("webp");
  });

  it("produces valid output that sharp can read", async () => {
    const jpegBuffer = await createTestJpeg(400, 300);
    const result = await optimizeImage(jpegBuffer, "image/jpeg");

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  });
});

describe("convertToWebp", () => {
  it("converts JPEG to WebP", async () => {
    const jpegBuffer = await createTestJpeg(800, 600);
    const result = await convertToWebp(jpegBuffer);

    expect(result.originalBytes).toBe(jpegBuffer.length);
    expect(result.optimizedBytes).toBeGreaterThan(0);
    expect(result.format).toBe("webp");

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("converts PNG to WebP", async () => {
    const pngBuffer = await createTestPng(800, 600);
    const result = await convertToWebp(pngBuffer);

    expect(result.originalBytes).toBe(pngBuffer.length);
    expect(result.optimizedBytes).toBeGreaterThan(0);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("WebP output is smaller than high-quality JPEG input", async () => {
    const jpegBuffer = await createTestJpeg(1600, 1200);
    const result = await convertToWebp(jpegBuffer);

    expect(result.optimizedBytes).toBeLessThan(result.originalBytes);
    expect(result.savingsBytes).toBeGreaterThan(0);
    expect(result.reductionPercent).toBeGreaterThan(0);
  });

  it("preserves image dimensions", async () => {
    const jpegBuffer = await createTestJpeg(500, 300);
    const result = await convertToWebp(jpegBuffer);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(500);
    expect(metadata.height).toBe(300);
  });
});
