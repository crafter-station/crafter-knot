import { attachPointer } from "./interaction/pointer";
import { createPose } from "./interaction/pose";
import type { Shape } from "./knot";
import { createBuilder } from "./knot/builder";
import { layout } from "./layout";
import { fromEuler } from "./math/quat";
import { createPoster } from "./poster";
import { createRenderer } from "./render/renderer";
import { GEOMETRY, limit, luminance, type Look } from "./state/look";
import { load, save } from "./state/saved";
import { snapshot } from "./state/snapshot";
import { createStore } from "./state/store";
import { createDrawer, type Drawer } from "./ui/drawer";
import "./styles.css";

const SETTLE = 400;

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const hint = document.querySelector<HTMLElement>("#hint")!;
if (matchMedia("(pointer: coarse)").matches) hint.textContent = "Drag to turn";
const params = new URLSearchParams(location.search);
const fitted = layout(Number(params.get("frame")) || undefined);
const turn = params
  .get("turn")
  ?.split(",")
  .map((degrees) => (Number(degrees) * Math.PI) / 180);
const saved = load();
const look = createStore(saved.look);
const pose = createPose(turn ? fromEuler(turn[1] ?? 0, turn[0] ?? 0, 0) : (saved.orientation ?? undefined));
const shapeOf = ({ facets, twist, ends, thickness }: Look): Shape => ({ facets, twist, ends, thickness });
const builder = createBuilder();

let drawer: Drawer | undefined;
let settling = 0;
const persist = () => {
  clearTimeout(settling);
  settling = window.setTimeout(() => save(snapshot(look.get(), pose.orientation)), SETTLE);
};

const renderer = createRenderer(canvas, builder.build(shapeOf(look.get())), pose, {
  layout: fitted,
  look,
  onFrame: () => {
    drawer?.follow();
    persist();
  },
});
drawer = createDrawer({ look, pose, placed: renderer.invalidate, capture: renderer.capture });

let built = look.get();
let building = false;
const reshape = async () => {
  if (building) return;
  const wanted = look.get();
  if (GEOMETRY.every((key) => wanted[key] === built[key])) return;
  building = true;
  built = wanted;
  await renderer.reshape(await builder.build(shapeOf(wanted)));
  building = false;
  reshape();
};

const apply = () => {
  const { background, spin, environment, backdrop } = look.get();
  const scenic = environment !== "studio" && backdrop === "scene";
  document.documentElement.dataset.tone = !scenic && luminance(background) > 0.3 ? "light" : "dark";
  document.body.style.background = background;
  pose.spin(spin);
  renderer.invalidate();
  reshape();
};
look.subscribe(apply);
apply();

attachPointer(canvas, pose, {
  change: () => {
    hint.dataset.hidden = "";
    renderer.invalidate();
  },
  zoom: (factor) => look.set({ zoom: limit("zoom", look.get().zoom * factor) }),
});

renderer.ready.catch((error: unknown) => {
  const poster = createPoster(fitted);
  const fit = () => poster.fit(canvas.clientWidth, canvas.clientHeight);
  fit();
  window.addEventListener("resize", fit);
  document.body.append(poster.element);
  hint.textContent = "Turning it needs WebGPU";
  console.error(error);
});
