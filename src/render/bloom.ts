import { effect, sampler, target, type Frame, type Gpu, type Target } from "vgpu";
import extractWgsl from "./shaders/bloom-extract.wgsl";
import downWgsl from "./shaders/bloom-down.wgsl";
import upWgsl from "./shaders/bloom-up.wgsl";

const LEVELS = 6;
const RADIUS = 0.85;
const THRESHOLD = 0.75;
const SMOOTHING = 0.6;

type Size = readonly [number, number];

export interface Bloom {
  readonly result: Target;
  readonly sampler: GPUSampler;
  resize(size: Size): void;
  compile(): Promise<unknown>;
  run(current: Frame): void;
}

const mip = ([width, height]: Size, level: number): Size => [
  Math.max(1, width >> level),
  Math.max(1, height >> level),
];

export function createBloom(gpu: Gpu, source: Target): Bloom {
  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const chain = (name: string, length: number) =>
    Array.from({ length }, (_, i) =>
      target(gpu, { size: mip(source.size, i + 1), format: "rgba16float", label: `${name}-${i}` }),
    );
  const down = chain("bloom-down", LEVELS);
  const up = chain("bloom-up", LEVELS - 1);
  const extract = effect(gpu, extractWgsl, {
    label: "bloom-extract",
    set: { src: source, srcSampler: linear, extract: { threshold: THRESHOLD, smoothing: SMOOTHING } },
  });
  const downs = down
    .slice(1)
    .map((_, i) =>
      effect(gpu, downWgsl, { label: `bloom-down-${i}`, set: { src: down[i], srcSampler: linear } }),
    );
  const ups = up.map((_, i) => {
    const coarse = i === up.length - 1 ? down[i + 1] : up[i + 1];
    return effect(gpu, upWgsl, {
      label: `bloom-up-${i}`,
      set: { coarse, fine: down[i], bloomSampler: linear },
    });
  });
  const texels = () => {
    downs.forEach((pass, i) => pass.set({ down: { texel: down[i].texelSize } }));
    ups.forEach((pass, i) => {
      const coarse = i === up.length - 1 ? down[i + 1] : up[i + 1];
      pass.set({ up: { texel: coarse.texelSize, radius: RADIUS } });
    });
  };
  texels();
  return {
    result: up[0],
    sampler: linear,
    compile: () =>
      Promise.all([
        extract.compile(down[0]),
        ...downs.map((pass, i) => pass.compile(down[i + 1])),
        ...ups.map((pass, i) => pass.compile(up[i])),
      ]),
    resize(size) {
      [down, up].forEach((levels) => levels.forEach((level, i) => level.resize(mip(size, i + 1))));
      texels();
    },
    run(current) {
      current.pass({ target: down[0] }, (pass) => pass.draw(extract));
      downs.forEach((pass, i) => current.pass({ target: down[i + 1] }, (p) => p.draw(pass)));
      for (let i = ups.length - 1; i >= 0; i--) current.pass({ target: up[i] }, (p) => p.draw(ups[i]));
    },
  };
}
