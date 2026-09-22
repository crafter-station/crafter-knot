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
import sunrise from "../assets/spruit-sunrise.hdr.jpg";
import type { Pose } from "../interaction/pose";
import type { KnotMesh } from "../knot";
import type { Layout } from "../layout";
import { rotation } from "../math/mat4";
import { linear, PATTERNS, type Look } from "../state/look";
import type { Store } from "../state/store";
import { createBloom, type Bloom } from "./bloom";
import { createCamera } from "./camera";
import knotWgsl from "./shaders/knot.wgsl";
import presentWgsl from "./shaders/present.wgsl";
import { emptySky, loadSky, skySampler, type Sky } from "./sky";

const TAU = Math.PI * 2;
const BACKDROP_FOV = 50;

type Outdoors = Exclude<Look["environment"], "studio">;

const SKIES: Record<Outdoors, string> = { sunrise };

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
  readonly thickness: number;
  readonly radius: number;
}

interface Stage {
  readonly gpu: Gpu;
  readonly output: Surface;
  readonly lit: Target;
  readonly bloom: Bloom;
  readonly present: Effect;
  readonly sampler: GPUSampler;
  tube: Tube;
  sky: Sky;
  outdoors?: Outdoors;
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
    thickness: mesh.thickness,
    radius: mesh.radius,
  };
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  mesh: Promise<KnotMesh>,
  pose: Pose,
  options: Options,
): Renderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let stage: Stage | undefined;
  let request = 0;
  let previous = 0;
  const loading = new Set<Outdoors>();

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

  const fetchSky = async (current: Stage) => {
    const { environment } = options.look.get();
    if (environment === "studio" || environment === current.outdoors || loading.has(environment)) return;
    loading.add(environment);
    try {
      const sky = await loadSky(current.gpu, SKIES[environment]);
      if (disposed) return sky.destroy();
      current.sky.destroy();
      current.sky = sky;
      current.outdoors = environment;
      invalidate();
    } catch (error) {
      console.error(error);
    } finally {
      loading.delete(environment);
    }
  };

  const start = async () => {
    const [created, first] = await Promise.all([init(), mesh]);
    gpu = created;
    if (disposed) return gpu.dispose();
    const output = surface(gpu, canvas, { dpr: [1, 2], alphaMode: "premultiplied" });
    const lit = target(gpu, {
      size: output.size,
      format: "rgba16float",
      msaa: true,
      depth: true,
      label: "lit",
    });
    const tube = createTube(gpu, first);
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
    const current: Stage = {
      gpu,
      output,
      lit,
      bloom,
      present,
      tube,
      sampler: skySampler(gpu),
      sky: emptySky(gpu),
    };
    await fetchSky(current);
    if (disposed) return;
    stage = current;
    output.onResize(invalidate);
    options.look.subscribe(() => {
      fetchSky(current);
      invalidate();
    });
    render(current, pose, options, false);
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

function render(stage: Stage, pose: Pose, options: Options, transparent: boolean): void {
  const { gpu, output, lit, bloom, present, tube, sky, sampler } = stage;
  const look = options.look.get();
  const background = linear(look.background);
  const outdoors = look.environment !== "studio" && look.environment === stage.outdoors;
  const turn = (look.light * Math.PI) / 180;
  frame(gpu, (current) => {
    const [width, height] = output.size;
    if (lit.size[0] !== width || lit.size[1] !== height) {
      lit.resize(output.size);
      bloom.resize(output.size);
    }
    const markSize = options.layout(width / output.dpr, height / output.dpr) * output.dpr * look.zoom;
    const camera = createCamera(output.size, markSize, look.perspective);
    const lens = Math.tan((Math.max(BACKDROP_FOV, look.perspective) * Math.PI) / 360);
    tube.draw.set({
      knot: {
        viewProjection: camera.viewProjection,
        model: rotation(pose.orientation),
        eye: camera.eye,
        rig: [turn, look.highlights, look.fill, look.rim],
        color: linear(look.color),
        metalness: look.metalness,
        accent: linear(look.accent),
        roughness: look.roughness,
        backdrop: background,
        clearcoat: look.clearcoat,
        iridescence: look.iridescence,
        glow: look.glow,
        exposure: look.exposure,
        thickness: look.thickness / tube.thickness,
        flatten: look.flatten,
        pattern: PATTERNS.indexOf(look.pattern),
        scale: look.scale,
        slant: look.slant,
        circumference: TAU * tube.radius * look.thickness,
        sky: outdoors ? 1 : 0,
        levels: sky.levels,
      },
      specular: sky.specular,
      irradiance: sky.irradiance,
      skySampler: sampler,
    });
    present.set({
      scene: lit,
      sky: sky.specular,
      skySampler: sampler,
      present: {
        background,
        vignette: look.vignette,
        lens: [(lens * width) / height, lens],
        transparent: transparent ? 1 : 0,
        bloom: look.bloom,
        scenery: outdoors && look.backdrop === "scene" ? 1 : 0,
        blur: look.blur * look.blur * sky.levels,
        turn,
        exposure: look.exposure,
      },
    });
    current.pass({ target: lit, clear: [0, 0, 0, 0] }, (pass) => pass.draw(tube.draw));
    if (look.bloom > 0) bloom.run(current);
    current.pass({ target: output }, (pass) => pass.draw(present));
  });
  options.onFrame();
}
