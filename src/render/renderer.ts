import {
  draw,
  effect,
  frame,
  geometry,
  init,
  surface,
  target,
  type Draw,
  type Effect,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import type { Pose } from "../interaction/pose";
import type { KnotMesh } from "../knot";
import { rotation } from "../math/mat4";
import { linear, type Look } from "../state/look";
import type { Store } from "../state/store";
import type { Layout } from "../layout";
import { viewProjection } from "./camera";
import knotWgsl from "./shaders/knot.wgsl";
import presentWgsl from "./shaders/present.wgsl";

export interface Options {
  readonly layout: Layout;
  readonly look: Store<Look>;
  readonly onFrame: () => void;
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
          { data: mesh.cores, attributes: { core: "float32x3" } },
          { data: mesh.occlusion, attributes: { occlusion: "float32" } },
        ],
        indices: mesh.indices,
      }),
      cull: "back",
      label: "knot",
    });
    const present = effect(gpu, presentWgsl, { label: "present" });
    await Promise.all([knot.compile(lit), present.compile({ colors: [output.format] })]);
    if (disposed) return;
    stage = { gpu, output, lit, knot, present };
    output.onResize(invalidate);
    options.look.subscribe(invalidate);
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

function render({ gpu, output, lit, knot, present }: Stage, pose: Pose, options: Options): void {
  const look = options.look.get();
  const background = linear(look.background);
  frame(gpu, (current) => {
    const [width, height] = output.size;
    if (lit.size[0] !== width || lit.size[1] !== height) lit.resize(output.size);
    const markSize = options.layout(width / output.dpr, height / output.dpr) * output.dpr * look.zoom;
    knot.set({
      knot: {
        viewProjection: viewProjection(output.size, markSize),
        model: rotation(pose.orientation),
        color: linear(look.color),
        metalness: look.metalness,
        backdrop: background,
        roughness: look.roughness,
        clearcoat: look.clearcoat,
        exposure: look.exposure,
        light: (look.light * Math.PI) / 180,
        thickness: look.thickness,
      },
    });
    present.set({ scene: lit, present: { background } });
    current.pass({ target: lit, clear: [0, 0, 0, 0] }, (pass) => pass.draw(knot));
    current.pass({ target: output }, (pass) => pass.draw(present));
  });
  options.onFrame();
}
