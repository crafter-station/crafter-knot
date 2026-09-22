import type { Quat } from "../math/quat";
import { DEFAULT_LOOK, readLook, type Look } from "./look";
import { readOrientation } from "./snapshot";

const KEY = "crafter-knot:state";

export interface Saved {
  readonly look: Look;
  readonly orientation: Quat | null;
}

export function load(): Saved {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return { look: readLook(parsed), orientation: readOrientation(parsed) };
  } catch {
    return { look: DEFAULT_LOOK, orientation: null };
  }
}

export function save(state: object): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    return;
  }
}
