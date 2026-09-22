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
import { MEAN_RADIUS, type KnotMesh } from "../knot";
import type { Layout } from "../layout";
import { rotation } from "../math/mat4";
import { linear, PATTERNS, type Look } from "../state/look";
import type { Store } from "../state/store";
import { createBloom, type Bloom } from "./bloom";
import { createCamera } from "./camera";
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
  reshape(mesh: KnotMesh): Promise<void>;
  capture(transparent: boolean): Promise<Blob>;
  dispose(): void;
}

interface Tube {
  readonly draw: Draw;
  readonly geometry: ReturnType<typeof geometry>;
}

interface Stage {
  readonly gpu: Gpu;
  readonly output: Surface;
  readonly lit: Target;
  readonly bloom: Bloom;
  readonly present: Effect;
  tube: Tube;
}

function createTube(gpu: Gpu, mesh: KnotMesh): Tube {
  const shape = geometry(gpu, {
    buffers: [
      { data: mesh.positions, attributes: { position: "float32x3" } },
      { data: mesh.normals, attributes: { normal: "float32x3" } },
      { data: mesh.cores, attributes: { core: "float32x3" } },
      { data: mesh.coords, attributes: { coords: "float32x2" } },
      { data: mesh.occlusion, attributes: { occlusion: "float32" } },
    ],
    indices: mesh.indices,
  });
  return {
    geometry: shape,
    draw: draw(gpu, { shader: knotWgsl, geometry: shape, cull: "back", label: "knot" }),
  };
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
    render(stage, pose, options, false);
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
    const output = surface(gpu, canvas, { dpr: [1, 2], alphaMode: "premultiplied" });
    const lit = target(gpu, {
      size: output.size,
      format: "rgba16float",
      msaa: true,
      depth: true,
      label: "lit",
    });
    const tube = createTube(gpu, mesh);
    const bloom = createBloom(gpu, lit);
    const present = effect(gpu, presentWgsl, {
      label: "present",
      set: { halo: bloom.result, haloSampler: bloom.sampler },
    });
    await Promise.all([
      tube.draw.compile(lit),
      bloom.compile(),
      present.compile({ colors: [output.format] }),
    ]);
    if (disposed) return;
    stage = { gpu, output, lit, bloom, present, tube };
    output.onResize(invalidate);
    options.look.subscribe(invalidate);
    render(stage, pose, options, false);
  };

  const ready = start();

  return {
    ready,
    invalidate,
    async reshape(next) {
      await ready;
      if (!stage || !gpu) return;
      const tube = createTube(gpu, next);
      await tube.draw.compile(stage.lit);
      if (disposed) return tube.geometry.destroy();
      const old = stage.tube;
      stage.tube = tube;
      old.geometry.destroy();
      invalidate();
    },
    async capture(transparent) {
      await ready;
      if (!stage) throw new Error("The renderer is not running");
      render(stage, pose, options, transparent);
      const blob = new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("Capture failed"))),
          "image/png",
        ),
      );
      invalidate();
      return blob;
    },
    dispose() {
      disposed = true;
      if (request) cancelAnimationFrame(request);
      stage?.output.dispose();
      gpu?.dispose();
    },
  };
}

function render(
  { gpu, output, lit, bloom, present, tube }: Stage,
  pose: Pose,
  options: Options,
  transparent: boolean,
): void {
  const look = options.look.get();
  const background = linear(look.background);
  frame(gpu, (current) => {
    const [width, height] = output.size;
    if (lit.size[0] !== width || lit.size[1] !== height) {
      lit.resize(output.size);
      bloom.resize(output.size);
    }
    const markSize = options.layout(width / output.dpr, height / output.dpr) * output.dpr * look.zoom;
    const camera = createCamera(output.size, markSize, look.perspective);
    tube.draw.set({
      knot: {
        viewProjection: camera.viewProjection,
        model: rotation(pose.orientation),
        eye: camera.eye,
        rig: [(look.light * Math.PI) / 180, look.highlights, look.fill, look.rim],
        color: linear(look.color),
        metalness: look.metalness,
        accent: linear(look.accent),
        roughness: look.roughness,
        backdrop: background,
        clearcoat: look.clearcoat,
        iridescence: look.iridescence,
        glow: look.glow,
        exposure: look.exposure,
        thickness: look.thickness,
        flatten: look.flatten,
        pattern: PATTERNS.indexOf(look.pattern),
        scale: look.scale,
        slant: look.slant,
        circumference: 2 * Math.PI * MEAN_RADIUS,
      },
    });
    present.set({
      scene: lit,
      present: { background, vignette: look.vignette, transparent: transparent ? 1 : 0, bloom: look.bloom },
    });
    current.pass({ target: lit, clear: [0, 0, 0, 0] }, (pass) => pass.draw(tube.draw));
    if (look.bloom > 0) bloom.run(current);
    current.pass({ target: output }, (pass) => pass.draw(present));
  });
  options.onFrame();
}
