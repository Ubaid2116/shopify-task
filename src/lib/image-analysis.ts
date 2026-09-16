import { ImageStatus } from "../generated/prisma/enums";

const OPTIMIZED_FORMATS = ["image/webp", "image/avif"];

/**
 * Compression ratio estimates based on industry benchmarks and Sharp library documentation.
 * These are conservative estimates for initial display purposes.
 *
 * Methodology:
 * - JPEG: 65% of original size (mozjpeg at quality 80 typically achieves 30-50% reduction)
 * - PNG: 50% of original size (optipng/pngquant at level 8 typically achieves 40-60% reduction)
 * - BMP/TIFF: 35-40% (these formats are rarely optimized, significant gains expected)
 * - Default: 65% for unknown formats (conservative estimate)
 *
 * IMPORTANT: These are ESTIMATES only. Actual savings depend on image content, complexity,
 * and color palette. For accurate sizing, process a temporary copy of the image.
 * The "estimated" prefix in field names indicates these values are calculated, not measured.
 */
const COMPRESSION_ESTIMATES: Record<string, number> = {
  "image/jpeg": 0.65,
  "image/jpg": 0.65,
  "image/png": 0.5,
  "image/bmp": 0.35,
  "image/tiff": 0.4,
};

/**
 * Classification thresholds for image optimization status:
 *
 * OPTIMIZED:
 *   - Already in modern format (WebP/AVIF), OR
 *   - File size <= 200KB (small enough that optimization收益 is minimal)
 *
 * RECOMMENDED:
 *   - File size between 200KB and 1MB
 *   - Optimization would provide noticeable performance benefit
 *
 * HIGH_PRIORITY:
 *   - File size > 1MB
 *   - Significant performance impact, should be optimized urgently
 *
 * FAILED:
 *   - Processing failed (download error, unsupported format, etc.)
 */
const THRESHOLDS = {
  OPTIMIZED_MAX_BYTES: 200 * 1024,    // 200KB
  RECOMMENDED_MAX_BYTES: 1024 * 1024, // 1MB
};

export function detectFormat(
  url: string,
  contentType: string | null,
): string {
  if (contentType && contentType !== "application/octet-stream") {
    return contentType;
  }

  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/jpeg";
  }
}

export function isOptimizedFormat(format: string): boolean {
  return OPTIMIZED_FORMATS.includes(format);
}

export function classifyImage(
  format: string,
  sizeBytes: number | null,
): ImageStatus {
  if (isOptimizedFormat(format)) {
    return ImageStatus.OPTIMIZED;
  }

  if (sizeBytes === null) {
    return ImageStatus.RECOMMENDED;
  }

  if (sizeBytes <= THRESHOLDS.OPTIMIZED_MAX_BYTES) {
    return ImageStatus.OPTIMIZED;
  }

  if (sizeBytes > THRESHOLDS.RECOMMENDED_MAX_BYTES) {
    return ImageStatus.HIGH_PRIORITY;
  }

  return ImageStatus.RECOMMENDED;
}

export function estimateOptimizedSize(
  format: string,
  originalBytes: number | null,
): { estimatedBytes: number | null; savingsBytes: number | null; reductionPercent: number | null } {
  if (originalBytes === null || originalBytes === 0) {
    return { estimatedBytes: null, savingsBytes: null, reductionPercent: null };
  }

  if (isOptimizedFormat(format)) {
    return {
      estimatedBytes: originalBytes,
      savingsBytes: 0,
      reductionPercent: 0,
    };
  }

  const ratio = COMPRESSION_ESTIMATES[format] ?? 0.65;
  const estimatedBytes = Math.round(originalBytes * ratio);
  const savingsBytes = originalBytes - estimatedBytes;
  const reductionPercent = Math.round((savingsBytes / originalBytes) * 100);

  return { estimatedBytes, savingsBytes, reductionPercent };
}
