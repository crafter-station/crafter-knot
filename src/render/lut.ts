import { texture, type Gpu, type Texture } from "vgpu";

const KTX2_HEADER = 12;
const LEVEL_INDEX = 80;

export interface Lut {
  readonly texture: Texture;
  readonly size: number;
}

export async function loadLut(gpu: Gpu, url: string): Promise<Lut> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  const bytes = new DataView(await response.arrayBuffer());
  const [width, height, depth] = [2, 3, 4].map((field) => bytes.getUint32(KTX2_HEADER + field * 4, true));
  const offset = Number(bytes.getBigUint64(LEVEL_INDEX, true));
  const length = Number(bytes.getBigUint64(LEVEL_INDEX + 8, true));
  const lut = texture(gpu, {
    kind: "3d",
    size: [width, height, depth],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst"],
    label: "lut",
  });
  gpu.gpu.queue.writeTexture(
    { texture: lut.gpu },
    new Uint8Array(bytes.buffer, offset, length),
    { bytesPerRow: width * 4, rowsPerImage: height },
    [width, height, depth],
  );
  return { texture: lut, size: width };
}
