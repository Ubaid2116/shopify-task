import { ImageStatus } from "../generated/prisma/enums";

const OPTIMIZED_FORMATS = ["image/webp", "image/avif"];
const COMPRESSION_ESTIMATES: Record<string, number> = {
  "image/jpeg": 0.65,
  "image/jpg": 0.65,
  "image/png": 0.5,
  "image/bmp": 0.35,
  "image/tiff": 0.4,
};

const THRESHOLDS = {
  OPTIMIZED_MAX_BYTES: 200 * 1024,
  RECOMMENDED_MAX_BYTES: 1024 * 1024,
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
