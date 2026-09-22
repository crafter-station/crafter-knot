import type { Pose } from "../interaction/pose";
import { IDENTITY } from "../math/quat";
import {
  DEFAULT_LOOK,
  FINISHES,
  LIGHT,
  MATERIAL,
  SHAPE,
  readLook,
  sameFinish,
  type Look,
  type Range,
} from "../state/look";
import { pretty, readOrientation, snapshot } from "../state/snapshot";
import type { Store } from "../state/store";
import "./drawer.css";

const COPIED = 1400;

export interface Drawer {
  follow(): void;
}

type Attributes = Record<string, string>;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  element.append(...children);
  return element;
}

export function createDrawer(look: Store<Look>, pose: Pose, placed: () => void): Drawer {
  const handle = node("button", { class: "handle", type: "button", "aria-label": "Open look controls" });
  const close = node("button", { type: "button" }, "Close");
  const sheet = node(
    "aside",
    { class: "sheet", "aria-label": "Look controls" },
    node("div", { class: "top" }, node("span", { class: "title" }, "Look"), close),
  );

  const finishes = FINISHES.map(([name, finish]) => {
    const button = node("button", { type: "button" }, name);
    button.addEventListener("click", () => look.set(finish));
    return { button, finish };
  });
  sheet.append(
    node(
      "div",
      { class: "finishes", role: "group", "aria-label": "Finish" },
      ...finishes.map((f) => f.button),
    ),
  );

  const swatch = (key: "color" | "background", label: string) => {
    const input = node("input", { type: "color", "aria-label": label });
    input.addEventListener("input", () => look.set({ [key]: input.value }));
    return { key, input, element: node("label", { class: "swatch" }, input, node("span", {}, label)) };
  };
  const swatches = [swatch("color", "Tube"), swatch("background", "Background")];

  const slider = ({ key, label, min, max, step, unit = "" }: Range) => {
    const input = node("input", { type: "range", min: `${min}`, max: `${max}`, step: `${step}` });
    const readout = node("span", { class: "value" });
    const digits = Math.max(0, -Math.floor(Math.log10(step)));
    input.addEventListener("input", () => look.set({ [key]: Number(input.value) }));
    const sync = (value: number) => {
      input.value = `${value}`;
      readout.textContent = `${value.toFixed(digits)}${unit}`;
    };
    return { key, sync, element: node("label", { class: "row" }, node("span", {}, label), readout, input) };
  };
  const sliders = [...MATERIAL, ...LIGHT, ...SHAPE].map(slider);
  const group = (title: string, ranges: readonly Range[], ...extra: Node[]) =>
    node(
      "section",
      {},
      node("h3", {}, title),
      ...extra,
      ...sliders.filter((s) => ranges.some((r) => r.key === s.key)).map((s) => s.element),
    );

  const front = node("button", { type: "button", class: "quiet" }, "Face front");
  front.addEventListener("click", () => {
    pose.place(IDENTITY);
    placed();
  });

  const json = node("textarea", {
    class: "json",
    spellcheck: "false",
    "aria-label": "State as JSON",
    rows: "13",
  });
  const copy = node("button", { type: "button" }, "Copy JSON");
  const reset = node("button", { type: "button", class: "quiet" }, "Reset");
  let copying = 0;

  sheet.append(
    group("Material", MATERIAL, node("div", { class: "swatches" }, ...swatches.map((s) => s.element))),
    group("Light", LIGHT),
    group("Shape", SHAPE),
    node("div", { class: "actions" }, front),
    node("section", {}, node("h3", {}, "State"), json, node("div", { class: "actions" }, copy, reset)),
  );
  document.body.append(handle, sheet);

  const text = () => pretty(snapshot(look.get(), pose.orientation));

  const refresh = () => {
    const current = look.get();
    finishes.forEach(({ button, finish }) =>
      button.setAttribute("aria-pressed", `${sameFinish(current, finish)}`),
    );
    swatches.forEach(({ key, input }) => (input.value = current[key]));
    sliders.forEach(({ key, sync }) => sync(current[key] as number));
    if (document.activeElement !== json) {
      json.value = text();
      json.removeAttribute("data-invalid");
    }
  };

  json.addEventListener("input", () => {
    try {
      const parsed: unknown = JSON.parse(json.value);
      json.removeAttribute("data-invalid");
      look.set(readLook(parsed, look.get()));
      const orientation = readOrientation(parsed);
      if (orientation) {
        pose.place(orientation);
        placed();
      }
    } catch {
      json.setAttribute("data-invalid", "");
    }
  });
  json.addEventListener("blur", refresh);

  copy.addEventListener("click", async () => {
    const value = text();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      json.value = value;
      json.select();
      document.execCommand("copy");
    }
    copy.textContent = "Copied";
    clearTimeout(copying);
    copying = window.setTimeout(() => (copy.textContent = "Copy JSON"), COPIED);
  });

  reset.addEventListener("click", () => {
    look.set(DEFAULT_LOOK);
    pose.place(IDENTITY);
    placed();
  });

  const setOpen = (open: boolean) => {
    sheet.toggleAttribute("data-open", open);
    handle.setAttribute("aria-expanded", `${open}`);
    sheet.inert = !open;
    if (open) refresh();
  };
  handle.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));
  window.addEventListener("keydown", (event) => event.key === "Escape" && setOpen(false));
  look.subscribe(refresh);
  setOpen(false);

  return {
    follow() {
      if (sheet.hasAttribute("data-open") && document.activeElement !== json) json.value = text();
    },
  };
}
