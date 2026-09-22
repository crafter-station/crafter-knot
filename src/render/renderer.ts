import {
  draw,
  effect,
  frame,
  geometry,
  init,
  sampler,
  surface,
  target,
  texture,
  type Draw,
  type Effect,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import { gaps, healed, type KnotMesh } from "../knot";
import { MASK_EXTENT, MASK_SIZE, rasterize } from "../knot/mask";
import { rotation } from "../math/mat4";
import * as quat from "../math/quat";
import type { Pose } from "../interaction/pose";
import type { Layout } from "../layout";
import { createCamera } from "./camera";
import knotWgsl from "./shaders/knot.wgsl";
import presentWgsl from "./shaders/present.wgsl";

const BACKGROUND = [1, 1, 1] as const;
const REVEAL: readonly [number, number] = [0.03, 0.5];
const SETTLE = 0.05;

export interface Options {
  readonly layout: Layout;
}

export interface Renderer {
  readonly ready: Promise<void>;
  invalidate(): void;
  dispose(): void;
}

interface Stage {
  readonly gpu: Gpu;
  readonly output: Surface;
  readonly lit: Target;
  readonly knot: Draw;
  readonly present: Effect;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const revealFor = (pose: Pose) => smoothstep(REVEAL[0], REVEAL[1], quat.angle(pose.orientation));

const flatnessFor = (pose: Pose) => 1 - smoothstep(0, SETTLE, quat.angle(pose.orientation));

export function createRenderer(
  canvas: HTMLCanvasElement,
  mesh: KnotMesh,
  pose: Pose,
  options: Options,
): Renderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let stage: Stage | undefined;
  let request = 0;
  let previous = 0;

  const tick = (now: number) => {
    request = 0;
    if (disposed || !stage) return;
    pose.step(Math.min(0.05, Math.max(0, (now - previous) / 1000)));
    previous = now;
    render(stage, pose, options);
    if (pose.moving) request = requestAnimationFrame(tick);
  };

  const invalidate = () => {
    if (request || disposed) return;
    previous = performance.now();
    request = requestAnimationFrame(tick);
  };

  const start = async () => {
    gpu = await init();
    if (disposed) return gpu.dispose();
    const output = surface(gpu, canvas, { dpr: [1, 2] });
    const lit = target(gpu, {
      size: output.size,
      format: "rgba16float",
      msaa: true,
      depth: true,
      label: "lit",
    });
    const knot = draw(gpu, {
      shader: knotWgsl,
      geometry: geometry(gpu, {
        buffers: [
          { data: mesh.positions, attributes: { position: "float32x3" } },
          { data: mesh.normals, attributes: { normal: "float32x3" } },
          { data: mesh.tracks, attributes: { track: "float32x3" } },
        ],
        indices: mesh.indices,
      }),
      label: "knot",
    });
    knot.set({
      mask: uploadMask(gpu),
      maskSampler: sampler(gpu, { minFilter: "linear", magFilter: "linear" }),
    });
    const present = effect(gpu, presentWgsl, { label: "present" });
    await Promise.all([knot.compile(lit), present.compile({ colors: [output.format] })]);
    if (disposed) return;
    stage = { gpu, output, lit, knot, present };
    output.onResize(invalidate);
    render(stage, pose, options);
  };

  return {
    ready: start(),
    invalidate,
    dispose() {
      disposed = true;
      if (request) cancelAnimationFrame(request);
      stage?.output.dispose();
      gpu?.dispose();
    },
  };
}

function render({ gpu, output, lit, knot, present }: Stage, pose: Pose, { layout }: Options): void {
  frame(gpu, (current) => {
    const [width, height] = output.size;
    if (lit.size[0] !== width || lit.size[1] !== height) lit.resize(output.size);
    const camera = createCamera(output.size, layout(width / output.dpr, height / output.dpr) * output.dpr);
    const model = rotation(pose.orientation);
    const reveal = revealFor(pose);
    knot.set({
      knot: {
        viewProjection: camera.viewProjection,
        model,
        gaps: gaps.map((gap) => healed(gap, reveal)).map(({ from, to, period }) => [from, to, period, 0]),
        look: [reveal, flatnessFor(pose), MASK_EXTENT, 0],
      },
    });
    present.set({ scene: lit, present: { background: BACKGROUND, grain: reveal } });
    current.pass({ target: lit, clear: [0, 0, 0, 0] }, (pass) => pass.draw(knot));
    current.pass({ target: output }, (pass) => pass.draw(present));
  });
}

function uploadMask(gpu: Gpu) {
  const mask = texture(gpu, {
    kind: "2d",
    size: [MASK_SIZE, MASK_SIZE],
    format: "r8unorm",
    usage: ["texture_binding", "copy_dst"],
    label: "mask",
  });
  gpu.gpu.queue.writeTexture({ texture: mask.gpu }, rasterize(), { bytesPerRow: MASK_SIZE }, [
    MASK_SIZE,
    MASK_SIZE,
  ]);
  return mask;
}
