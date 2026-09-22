import { MARK_PATH } from "./mark";
import { MARK } from "./strands";

export const MASK_SIZE = 2048;
export const MASK_EXTENT = 1.1;

export function rasterize(size = MASK_SIZE): Uint8Array<ArrayBuffer> {
  const context = new OffscreenCanvas(size, size).getContext("2d", { willReadFrequently: true })!;
  const scale = size / (2 * MASK_EXTENT * MARK.unit);
  const [x, y] = MARK.centre.map((c) => (MASK_EXTENT * MARK.unit - c) * scale);
  context.setTransform(scale, 0, 0, scale, x, y);
  context.fill(new Path2D(MARK_PATH));
  const { data } = context.getImageData(0, 0, size, size);
  const alpha = new Uint8Array(size * size);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}
