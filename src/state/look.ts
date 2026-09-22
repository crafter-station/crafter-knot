export interface Look {
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
  readonly clearcoat: number;
  readonly background: string;
  readonly exposure: number;
  readonly light: number;
  readonly thickness: number;
  readonly zoom: number;
  readonly spin: number;
}

export type Finish = Pick<Look, "color" | "metalness" | "roughness" | "clearcoat" | "background">;

export interface Range {
  readonly key: keyof Look;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
}

export const LACQUER: Finish = {
  color: "#111111",
  metalness: 0,
  roughness: 0.06,
  clearcoat: 0,
  background: "#ffffff",
};

export const FINISHES: readonly (readonly [name: string, finish: Finish])[] = [
  ["Lacquer", LACQUER],
  ["Chrome", { color: "#e4e6ea", metalness: 1, roughness: 0.04, clearcoat: 0, background: "#101012" }],
  ["Gold", { color: "#f5c46a", metalness: 1, roughness: 0.2, clearcoat: 0, background: "#f3eee5" }],
  ["Porcelain", { color: "#f2f0eb", metalness: 0, roughness: 0.3, clearcoat: 0.8, background: "#18181b" }],
  ["Rubber", { color: "#1d1d1f", metalness: 0, roughness: 0.78, clearcoat: 0, background: "#ffffff" }],
  ["Candy", { color: "#e2412c", metalness: 0, roughness: 0.4, clearcoat: 1, background: "#ffffff" }],
];

export const DEFAULT_LOOK: Look = { ...LACQUER, exposure: 1, light: 0, thickness: 1, zoom: 1, spin: 0 };

export const MATERIAL: readonly Range[] = [
  { key: "metalness", label: "Metal", min: 0, max: 1, step: 0.01 },
  { key: "roughness", label: "Roughness", min: 0, max: 1, step: 0.01 },
  { key: "clearcoat", label: "Clearcoat", min: 0, max: 1, step: 0.01 },
];

export const LIGHT: readonly Range[] = [
  { key: "exposure", label: "Exposure", min: 0.2, max: 3, step: 0.01 },
  { key: "light", label: "Light turn", min: -180, max: 180, step: 1, unit: "°" },
];

export const SHAPE: readonly Range[] = [
  { key: "thickness", label: "Thickness", min: 0.4, max: 1.6, step: 0.01, unit: "×" },
  { key: "zoom", label: "Zoom", min: 0.4, max: 3, step: 0.01, unit: "×" },
  { key: "spin", label: "Spin", min: -120, max: 120, step: 1, unit: "°/s" },
];

const RANGES = [...MATERIAL, ...LIGHT, ...SHAPE];
const HEX = /^#[0-9a-f]{6}$/i;

export function limit(key: keyof Look, value: number): number {
  const range = RANGES.find((r) => r.key === key);
  return range ? Math.min(range.max, Math.max(range.min, value)) : value;
}

export function sameFinish(look: Look, finish: Finish): boolean {
  return (Object.keys(finish) as (keyof Finish)[]).every((key) => look[key] === finish[key]);
}

export function readLook(source: unknown, base: Look = DEFAULT_LOOK): Look {
  if (typeof source !== "object" || source === null) return base;
  const input = source as Record<string, unknown>;
  const colour = (key: "color" | "background") =>
    typeof input[key] === "string" && HEX.test(input[key]) ? input[key].toLowerCase() : base[key];
  const numbers = Object.fromEntries(
    RANGES.map(({ key, min, max }) => {
      const value = input[key];
      return [
        key,
        typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : base[key],
      ];
    }),
  );
  return { ...base, ...numbers, color: colour("color"), background: colour("background") };
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
