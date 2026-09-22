import type { Pose } from "../interaction/pose";
import { IDENTITY } from "../math/quat";
import {
  DEFAULT_LOOK,
  FINISHES,
  readLook,
  sameFinish,
  SECTIONS,
  type Control,
  type Look,
} from "../state/look";
import { pretty, readOrientation, snapshot } from "../state/snapshot";
import type { Store } from "../state/store";
import "./drawer.css";

const COPIED = 1400;

export interface Drawer {
  follow(): void;
}

export interface DrawerOptions {
  readonly look: Store<Look>;
  readonly pose: Pose;
  readonly placed: () => void;
  readonly capture: (transparent: boolean) => Promise<Blob>;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  element.append(...children);
  return element;
}

const button = (label: string, action: () => void, className = "") => {
  const element = node("button", { type: "button", class: className }, label);
  element.addEventListener("click", action);
  return element;
};

interface Bound {
  readonly element: HTMLElement;
  sync(look: Look): void;
}

function bind(control: Control, look: Store<Look>): Bound {
  if (control.kind === "color") {
    const input = node("input", { type: "color", "aria-label": control.label });
    input.addEventListener("input", () => look.set({ [control.key]: input.value }));
    return {
      element: node("label", { class: "swatch" }, input, node("span", {}, control.label)),
      sync: (current) => (input.value = current[control.key]),
    };
  }
  if (control.kind === "choice") {
    const options = control.options.map(([value, label]) => ({
      value,
      element: button(label, () => look.set({ [control.key]: value } as Partial<Look>)),
    }));
    return {
      element: node(
        "div",
        { class: "choice" },
        node("span", {}, control.label),
        node(
          "div",
          { class: "segments", role: "group", "aria-label": control.label },
          ...options.map((o) => o.element),
        ),
      ),
      sync: (current) =>
        options.forEach(({ value, element }) =>
          element.setAttribute("aria-pressed", `${current[control.key] === value}`),
        ),
    };
  }
  const { key, label, min, max, step, unit = "" } = control;
  const input = node("input", {
    type: "range",
    min: `${min}`,
    max: `${max}`,
    step: `${step}`,
    "aria-label": label,
  });
  const readout = node("span", { class: "value" });
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  input.addEventListener("input", () => look.set({ [key]: Number(input.value) }));
  return {
    element: node("label", { class: "row" }, node("span", {}, label), readout, input),
    sync: (current) => {
      input.value = `${current[key]}`;
      readout.textContent = `${current[key].toFixed(digits)}${unit}`;
    },
  };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = node("a", { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createDrawer({ look, pose, placed, capture }: DrawerOptions): Drawer {
  const place = (orientation = IDENTITY) => {
    pose.place(orientation);
    placed();
  };
  const handle = node("button", { class: "handle", type: "button", "aria-label": "Open look controls" });
  const close = button("Close", () => setOpen(false));
  const finishes = FINISHES.map(([name, finish]) => ({
    finish,
    element: button(name, () => look.set(finish)),
  }));
  const bound: Bound[] = [];
  const sections = SECTIONS.map(({ title, controls }) => {
    const colors = controls.filter((c) => c.kind === "color").map((c) => bind(c, look));
    const rest = controls.filter((c) => c.kind !== "color").map((c) => bind(c, look));
    bound.push(...colors, ...rest);
    const swatches = colors.length
      ? [node("div", { class: "swatches" }, ...colors.map((c) => c.element))]
      : [];
    return node("section", {}, node("h3", {}, title), ...swatches, ...rest.map((c) => c.element));
  });

  let transparent = false;
  const clear = button(
    "Transparent",
    () => {
      transparent = !transparent;
      clear.setAttribute("aria-pressed", `${transparent}`);
    },
    "quiet toggle",
  );
  clear.setAttribute("aria-pressed", "false");
  const save = button("Save PNG", async () => download(await capture(transparent), "crafter-knot.png"));

  const json = node("textarea", {
    class: "json",
    spellcheck: "false",
    "aria-label": "State as JSON",
    rows: "14",
  });
  let copying = 0;
  const copy = button("Copy JSON", async () => {
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
  const reset = button(
    "Reset",
    () => {
      look.set(DEFAULT_LOOK);
      place();
    },
    "quiet",
  );

  const sheet = node(
    "aside",
    { class: "sheet", "aria-label": "Look controls" },
    node("div", { class: "top" }, node("span", { class: "title" }, "Look"), close),
    node(
      "div",
      { class: "finishes", role: "group", "aria-label": "Finish" },
      ...finishes.map((f) => f.element),
    ),
    ...sections,
    node(
      "div",
      { class: "actions" },
      button("Face front", () => place(), "quiet"),
    ),
    node("section", {}, node("h3", {}, "Export"), node("div", { class: "actions" }, save, clear)),
    node("section", {}, node("h3", {}, "State"), json, node("div", { class: "actions" }, copy, reset)),
  );
  document.body.append(handle, sheet);

  const text = () => pretty(snapshot(look.get(), pose.orientation));

  const refresh = () => {
    const current = look.get();
    finishes.forEach(({ finish, element }) =>
      element.setAttribute("aria-pressed", `${sameFinish(current, finish)}`),
    );
    bound.forEach(({ sync }) => sync(current));
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
      if (orientation) place(orientation);
    } catch {
      json.setAttribute("data-invalid", "");
    }
  });
  json.addEventListener("blur", refresh);

  const setOpen = (open: boolean) => {
    sheet.toggleAttribute("data-open", open);
    handle.setAttribute("aria-expanded", `${open}`);
    sheet.inert = !open;
    if (open) refresh();
  };
  handle.addEventListener("click", () => setOpen(true));
  window.addEventListener("keydown", (event) => event.key === "Escape" && setOpen(false));
  look.subscribe(refresh);
  setOpen(false);

  return {
    follow() {
      if (sheet.hasAttribute("data-open") && document.activeElement !== json) json.value = text();
    },
  };
}
