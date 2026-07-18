import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { sanitizeFileName } from "./agentTools";

export async function cropReferenceObjects(input: {
  sourcePath: string;
  outputDir: string;
  regions: Array<{ id: string; name: string; box: [number, number, number, number] }>;
}): Promise<Array<{ id: string; name: string; path: string }>> {
  const image = sharp(input.sourcePath).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("无法读取参考图尺寸。");
  await mkdir(input.outputDir, { recursive: true });
  return Promise.all(input.regions.map(async (region) => {
    const crop = normalizedBoxToPixels(region.box, metadata.width!, metadata.height!);
    const path = join(input.outputDir, `${sanitizeFileName(region.id)}-${sanitizeFileName(region.name || basename(input.sourcePath))}.png`);
    await sharp(input.sourcePath).rotate().extract(crop).png().toFile(path);
    return { id: region.id, name: region.name, path };
  }));
}

function normalizedBoxToPixels(box: [number, number, number, number], width: number, height: number): { left: number; top: number; width: number; height: number } {
  const [x, y, boxWidth, boxHeight] = box;
  if (![x, y, boxWidth, boxHeight].every((value) => Number.isFinite(value)) || boxWidth <= 0 || boxHeight <= 0) throw new Error("裁剪框必须是有效的 [x,y,width,height] 千分比坐标。");
  const left = Math.max(0, Math.min(width - 1, Math.floor(x / 1000 * width)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(y / 1000 * height)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil((x + boxWidth) / 1000 * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil((y + boxHeight) / 1000 * height)));
  return { left, top, width: right - left, height: bottom - top };
}
