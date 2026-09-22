import { attachPointer } from "./interaction/pointer";
import { createPose } from "./interaction/pose";
import { buildKnot } from "./knot";
import { layout } from "./layout";
import { fromEuler } from "./math/quat";
import { createPoster } from "./poster";
import { createRenderer } from "./render/renderer";
import "./styles.css";

const INTRO = 900;

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const hint = document.querySelector<HTMLElement>("#hint")!;
const params = new URLSearchParams(location.search);
const fitted = layout(Number(params.get("frame")) || undefined);
const turn = params
  .get("turn")
  ?.split(",")
  .map((degrees) => (Number(degrees) * Math.PI) / 180);
const pose = createPose(turn && fromEuler(turn[1] ?? 0, turn[0] ?? 0, 0));
const renderer = createRenderer(canvas, buildKnot(), pose, { layout: fitted });

attachPointer(canvas, pose, () => {
  hint.dataset.hidden = "";
  renderer.invalidate();
});

renderer.ready
  .then(() => {
    if (params.has("still") || turn) return;
    setTimeout(() => {
      pose.nudge();
      renderer.invalidate();
    }, INTRO);
  })
  .catch((error: unknown) => {
    const poster = createPoster(fitted);
    const fit = () => poster.fit(canvas.clientWidth, canvas.clientHeight);
    fit();
    window.addEventListener("resize", fit);
    document.body.append(poster.element);
    hint.textContent = "Turning it needs WebGPU";
    console.error(error);
  });
