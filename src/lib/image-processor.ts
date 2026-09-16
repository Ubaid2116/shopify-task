import sharp from "sharp";

const WEBP_QUALITY = 80;
const JPEG_QUALITY = 80;
const PNG_QUALITY = 80;

export type OptimizationResult = {
  originalBytes: number;
  optimizedBytes: number;
  savingsBytes: number;
  reductionPercent: number;
  format: string;
  buffer: Buffer;
};

export async function optimizeImage(
  imageBuffer: Buffer,
  originalFormat: string,
): Promise<OptimizationResult> {
  const originalBytes = imageBuffer.length;

  let pipeline = sharp(imageBuffer);

  if (originalFormat === "image/png") {
    pipeline = pipeline.png({ quality: PNG_QUALITY, compressionLevel: 8 });
  } else if (
    originalFormat === "image/jpeg" ||
    originalFormat === "image/jpg"
  ) {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  } else {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  }

  const optimizedBuffer = await pipeline.toBuffer();
  const optimizedBytes = optimizedBuffer.length;
  const savingsBytes = originalBytes - optimizedBytes;
  const reductionPercent =
    originalBytes > 0 ? Math.round((savingsBytes / originalBytes) * 100) : 0;

  return {
    originalBytes,
    optimizedBytes,
    savingsBytes,
    reductionPercent,
    format: "webp",
    buffer: optimizedBuffer,
  };
}

export async function convertToWebp(
  imageBuffer: Buffer,
): Promise<OptimizationResult> {
  const originalBytes = imageBuffer.length;

  const optimizedBuffer = await sharp(imageBuffer)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const optimizedBytes = optimizedBuffer.length;
  const savingsBytes = originalBytes - optimizedBytes;
  const reductionPercent =
    originalBytes > 0 ? Math.round((savingsBytes / originalBytes) * 100) : 0;

  return {
    originalBytes,
    optimizedBytes,
    savingsBytes,
    reductionPercent,
    format: "webp",
    buffer: optimizedBuffer,
  };
}

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
