import {
  effect,
  frame,
  sampler,
  target,
  texture,
  type Gpu,
  type Target,
  type TargetSignature,
  type Texture,
} from "vgpu";
import decodeWgsl from "./shaders/sky-decode.wgsl";
import irradianceWgsl from "./shaders/sky-irradiance.wgsl";
import prefilterWgsl from "./shaders/sky-prefilter.wgsl";
import shrinkWgsl from "./shaders/sky-shrink.wgsl";
import { readUltraHdr } from "./ultrahdr";

const FORMAT = "rgba16float";
const LEVELS = 6;
const IRRADIANCE: Size = [32, 16];
const IRRADIANCE_SOURCE = 64;
const HDR: TargetSignature = { colors: [FORMAT] };

type Size = readonly [number, number];

export interface Sky {
  readonly specular: Texture;
  readonly irradiance: Texture;
  readonly levels: number;
  destroy(): void;
}

const mip = ([width, height]: Size, level: number): Size => [
  Math.max(1, width >> level),
  Math.max(1, height >> level),
];

export const skySampler = (gpu: Gpu) =>
  sampler(gpu, {
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "clamp-to-edge",
  });

const owned = (specular: Texture, irradiance: Texture, levels: number): Sky => ({
  specular,
  irradiance,
  levels,
  destroy() {
    specular.destroy();
    irradiance.destroy();
  },
});

export function emptySky(gpu: Gpu): Sky {
  const blank = () =>
    texture(gpu, {
      kind: "2d",
      size: [1, 1],
      format: FORMAT,
      usage: ["texture_binding"],
      label: "sky-empty",
    });
  return owned(blank(), blank(), 0);
}

async function decodeImages(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  const { base, gain, map } = readUltraHdr(await response.arrayBuffer());
  const [baseImage, gainImage] = await Promise.all(
    [base, gain].map((blob) => createImageBitmap(blob, { colorSpaceConversion: "none" })),
  );
  return { base: baseImage, gain: gainImage, map };
}

function upload(gpu: Gpu, image: ImageBitmap, label: string): Texture {
  const size = [image.width, image.height] as const;
  const result = texture(gpu, {
    kind: "2d",
    size,
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst", "render_attachment"],
    label,
  });
  gpu.gpu.queue.copyExternalImageToTexture({ source: image }, { texture: result.gpu }, size);
  image.close();
  return result;
}

function stack(gpu: Gpu, into: Texture, levels: readonly Target[]) {
  const encoder = gpu.gpu.createCommandEncoder({ label: into.label });
  levels.forEach((level, mipLevel) =>
    encoder.copyTextureToTexture({ texture: level.color.gpu }, { texture: into.gpu, mipLevel }, level.size),
  );
  gpu.gpu.queue.submit([encoder.finish()]);
}

export async function loadSky(gpu: Gpu, url: string): Promise<Sky> {
  const images = await decodeImages(url);
  const size: Size = [images.base.width, images.base.height];
  const count = Math.floor(Math.log2(Math.max(...size))) + 1;
  const chained = (label: string, mipLevelCount: number) =>
    texture(gpu, {
      kind: "2d",
      size,
      format: FORMAT,
      mipLevelCount,
      usage: ["texture_binding", "copy_dst"],
      label,
    });
  const radiance = chained("sky-radiance", count);
  const specular = chained("sky-specular", LEVELS);
  const levels = (label: string, from: number, length: number) =>
    Array.from({ length }, (_, i) =>
      target(gpu, { size: mip(size, from + i), format: FORMAT, label: `${label}-${from + i}` }),
    );
  const chain = levels("sky-mip", 0, count);
  const blurred = levels("sky-rough", 1, LEVELS - 1);
  const irradiance = target(gpu, { size: IRRADIANCE, format: FORMAT, label: "sky-irradiance" });

  const base = upload(gpu, images.base, "sky-base");
  const gain = upload(gpu, images.gain, "sky-gain");
  const smooth = skySampler(gpu);
  const decode = effect(gpu, decodeWgsl, {
    label: "sky-decode",
    set: {
      base,
      gain,
      imageSampler: sampler(gpu, { magFilter: "linear", minFilter: "linear" }),
      decode: images.map,
    },
  });
  const shrinks = chain
    .slice(1)
    .map((_, i) =>
      effect(gpu, shrinkWgsl, { label: `sky-shrink-${i}`, set: { source: chain[i], skySampler: smooth } }),
    );
  const texel = (4 * Math.PI) / (size[0] * size[1]);
  const prefilters = blurred.map((_, i) =>
    effect(gpu, prefilterWgsl, {
      label: `sky-prefilter-${i}`,
      set: { radiance, skySampler: smooth, prefilter: { roughness: (i + 1) / (LEVELS - 1), texel } },
    }),
  );
  const convolve = effect(gpu, irradianceWgsl, {
    label: "sky-irradiance",
    set: { radiance, irradiance: { level: Math.log2(size[0] / IRRADIANCE_SOURCE) } },
  });
  await Promise.all([decode, ...shrinks, ...prefilters, convolve].map((pass) => pass.compile(HDR)));

  frame(gpu, (current) => {
    current.pass({ target: chain[0] }, decode);
    shrinks.forEach((pass, i) => current.pass({ target: chain[i + 1] }, pass));
  });
  stack(gpu, radiance, chain);
  frame(gpu, (current) => {
    prefilters.forEach((pass, i) => current.pass({ target: blurred[i] }, pass));
    current.pass({ target: irradiance }, convolve);
  });
  stack(gpu, specular, [chain[0], ...blurred]);
  await gpu.gpu.queue.onSubmittedWorkDone();
  [base, gain, radiance, ...[...chain, ...blurred].map((level) => level.color)].forEach((resource) =>
    resource.destroy(),
  );
  return owned(specular, irradiance.color, LEVELS - 1);
}
