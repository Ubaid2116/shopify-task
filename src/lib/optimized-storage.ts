import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const OPTIMIZED_DIR = join(process.cwd(), "public", "optimized");

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function saveOptimizedImage(
  shopId: string,
  imageId: string,
  buffer: Buffer,
  format: string,
): Promise<string> {
  const shopDir = join(OPTIMIZED_DIR, shopId);
  await ensureDir(shopDir);

  const extension = format.replace("image/", "");
  const filename = `${imageId}.${extension}`;
  const filepath = join(shopDir, filename);

  await writeFile(filepath, buffer);

  return `/optimized/${shopId}/${filename}`;
}

export async function getOptimizedImage(
  optimizedPath: string,
): Promise<Buffer | null> {
  try {
    const filepath = join(process.cwd(), "public", optimizedPath);
    return await readFile(filepath);
  } catch {
    return null;
  }
}
