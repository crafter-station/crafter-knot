export const PATTERNS = ["none", "rings", "stripes", "checker", "dots"] as const;
export const ENDS = ["round", "flat"] as const;
export const FACETS = [0, 3, 4, 5, 6, 8] as const;
export const ENVIRONMENTS = ["studio", "sunrise"] as const;
export const BACKDROPS = ["color", "scene"] as const;

export interface Look {
  readonly color: string;
  readonly accent: string;
  readonly background: string;
  readonly metalness: number;
  readonly roughness: number;
  readonly clearcoat: number;
  readonly iridescence: number;
  readonly glow: number;
  readonly bloom: number;
  readonly pattern: (typeof PATTERNS)[number];
  readonly scale: number;
  readonly slant: number;
  readonly thickness: number;
  readonly flatten: number;
  readonly facets: (typeof FACETS)[number];
  readonly twist: number;
  readonly ends: (typeof ENDS)[number];
  readonly environment: (typeof ENVIRONMENTS)[number];
  readonly backdrop: (typeof BACKDROPS)[number];
  readonly blur: number;
  readonly exposure: number;
  readonly highlights: number;
  readonly fill: number;
  readonly rim: number;
  readonly light: number;
  readonly vignette: number;
  readonly zoom: number;
  readonly perspective: number;
  readonly spin: number;
}

type KeysOf<T> = { [K in keyof Look]: Look[K] extends T ? K : never }[keyof Look];
export type NumberKey = Exclude<KeysOf<number>, "facets">;
export type ColorKey = "color" | "accent" | "background";
export type ChoiceKey = "pattern" | "facets" | "ends" | "environment" | "backdrop";

export type Control =
  | {
      readonly kind: "range";
      readonly key: NumberKey;
      readonly label: string;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly unit?: string;
    }
  | { readonly kind: "color"; readonly key: ColorKey; readonly label: string }
  | {
      readonly kind: "choice";
      readonly key: ChoiceKey;
      readonly label: string;
      readonly options: readonly (readonly [value: string | number, label: string])[];
    };

export interface Section {
  readonly title: string;
  readonly controls: readonly Control[];
}

const range = (
  key: NumberKey,
  label: string,
  min: number,
  max: number,
  step: number,
  unit?: string,
): Control => ({
  kind: "range",
  key,
  label,
  min,
  max,
  step,
  unit,
});

const title = (value: string) => value[0].toUpperCase() + value.slice(1);

const choice = (key: ChoiceKey, label: string, values: readonly string[]): Control => ({
  kind: "choice",
  key,
  label,
  options: values.map((value) => [value, title(value)]),
});

export const SECTIONS: readonly Section[] = [
  {
    title: "Material",
    controls: [
      { kind: "color", key: "color", label: "Tube" },
      range("metalness", "Metal", 0, 1, 0.01),
      range("roughness", "Roughness", 0, 1, 0.01),
      range("clearcoat", "Clearcoat", 0, 1, 0.01),
      range("iridescence", "Iridescence", 0, 1, 0.01),
      range("glow", "Glow", 0, 2, 0.01),
    ],
  },
  {
    title: "Texture",
    controls: [
      choice("pattern", "Pattern", PATTERNS),
      { kind: "color", key: "accent", label: "Accent" },
      range("scale", "Scale", 1, 24, 0.1),
      range("slant", "Slant", -2, 2, 0.01),
    ],
  },
  {
    title: "Shape",
    controls: [
      range("thickness", "Thickness", 0.1, 2.5, 0.01, "×"),
      range("flatten", "Depth", 0.15, 1.6, 0.01, "×"),
      {
        kind: "choice",
        key: "facets",
        label: "Profile",
        options: FACETS.map((f) => [f, f ? `${f}` : "Round"]),
      },
      range("twist", "Twist", -6, 6, 0.05, " turns"),
      choice("ends", "Ends", ENDS),
    ],
  },
  {
    title: "Scene",
    controls: [
      { kind: "color", key: "background", label: "Background" },
      choice("environment", "Environment", ENVIRONMENTS),
      choice("backdrop", "Backdrop", BACKDROPS),
      range("blur", "Blur", 0, 1, 0.01),
    ],
  },
  {
    title: "Light",
    controls: [
      range("exposure", "Exposure", 0.2, 3, 0.01),
      range("highlights", "Highlights", 0, 3, 0.01),
      range("fill", "Fill", 0, 3, 0.01),
      range("rim", "Rim", 0, 2, 0.01),
      range("light", "Light turn", -180, 180, 1, "°"),
      range("bloom", "Bloom", 0, 2, 0.01),
      range("vignette", "Vignette", 0, 1, 0.01),
    ],
  },
  {
    title: "Camera",
    controls: [
      range("zoom", "Zoom", 0.4, 3, 0.01, "×"),
      range("perspective", "Perspective", 0, 70, 1, "°"),
      range("spin", "Spin", -120, 120, 1, "°/s"),
    ],
  },
];

export const CONTROLS: readonly Control[] = SECTIONS.flatMap((section) => section.controls);
export const GEOMETRY: readonly (keyof Look)[] = ["facets", "twist", "ends", "thickness"];

const FINISH = {
  color: "#111111",
  accent: "#ffffff",
  background: "#ffffff",
  metalness: 0,
  roughness: 0.06,
  clearcoat: 0,
  iridescence: 0,
  glow: 0,
  bloom: 0,
  pattern: "none",
  scale: 6,
  slant: 0,
} as const satisfies Partial<Look>;

export type Finish = { -readonly [K in keyof typeof FINISH]: Look[K] };

const finish = (overrides: Partial<Finish>): Finish => ({ ...FINISH, ...overrides });

export const FINISHES: readonly (readonly [name: string, finish: Finish])[] = [
  ["Lacquer", finish({})],
  ["Chrome", finish({ color: "#e4e6ea", metalness: 1, roughness: 0.04, background: "#101012" })],
  ["Gold", finish({ color: "#f5c46a", metalness: 1, roughness: 0.2, background: "#f3eee5" })],
  ["Porcelain", finish({ color: "#f2f0eb", roughness: 0.3, clearcoat: 0.8, background: "#18181b" })],
  ["Rubber", finish({ color: "#1d1d1f", roughness: 0.78 })],
  [
    "Candy",
    finish({
      color: "#f6f3ee",
      accent: "#d8321f",
      roughness: 0.35,
      clearcoat: 1,
      pattern: "stripes",
      scale: 3,
      slant: 0.5,
    }),
  ],
  [
    "Pearl",
    finish({ color: "#f3ece6", roughness: 0.18, clearcoat: 1, iridescence: 1, background: "#1c1b20" }),
  ],
  ["Neon", finish({ color: "#39e6ff", roughness: 0.3, glow: 1.3, bloom: 1.2, background: "#07070a" })],
  [
    "Carbon",
    finish({
      color: "#161617",
      accent: "#2d2d30",
      roughness: 0.45,
      clearcoat: 1,
      pattern: "checker",
      scale: 12,
      slant: 0.25,
    }),
  ],
];

export const DEFAULT_LOOK: Look = {
  ...FINISH,
  thickness: 1.8,
  flatten: 1,
  facets: 0,
  twist: 0,
  ends: "round",
  environment: "studio",
  backdrop: "color",
  blur: 0,
  exposure: 1,
  highlights: 1,
  fill: 1,
  rim: 1,
  light: 0,
  vignette: 0,
  zoom: 1,
  perspective: 0,
  spin: 0,
};

const HEX = /^#[0-9a-f]{6}$/i;

export function limit(key: NumberKey, value: number): number {
  const control = CONTROLS.find((c) => c.key === key);
  return control?.kind === "range" ? Math.min(control.max, Math.max(control.min, value)) : value;
}

export function sameFinish(look: Look, preset: Finish): boolean {
  return (Object.keys(preset) as (keyof Finish)[]).every((key) => look[key] === preset[key]);
}

function read(control: Control, value: unknown, fallback: Look[keyof Look]): Look[keyof Look] {
  if (control.kind === "range")
    return typeof value === "number" && Number.isFinite(value) ? limit(control.key, value) : fallback;
  if (control.kind === "color")
    return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback;
  return control.options.some(([option]) => option === value) ? (value as Look[keyof Look]) : fallback;
}

export function readLook(source: unknown, base: Look = DEFAULT_LOOK): Look {
  if (typeof source !== "object" || source === null) return base;
  const input = source as Record<string, unknown>;
  return Object.fromEntries(
    CONTROLS.map((control) => [control.key, read(control, input[control.key], base[control.key])]),
  ) as unknown as Look;
}

export function linear(hex: string): [number, number, number] {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(1), channel(2)];
}

export const luminance = (hex: string): number => {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
