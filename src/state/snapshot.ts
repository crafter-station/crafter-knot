import type { Quat } from "../math/quat";
import type { Look } from "./look";

const round = (value: number) => Number(value.toFixed(4));

export const snapshot = (look: Look, orientation: Quat) => ({ ...look, orientation: orientation.map(round) });

export const pretty = (state: object): string =>
  JSON.stringify(state, null, 2).replace(
    /\[\s+([^\]]*?)\s+\]/g,
    (_, items: string) => `[${items.split(/,\s+/).join(", ")}]`,
  );

export function readOrientation(source: unknown): Quat | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as { orientation?: unknown }).orientation;
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return null;
  const [x, y, z, w] = value as number[];
  return Math.hypot(x, y, z, w) > 1e-6 ? [x, y, z, w] : null;
}
