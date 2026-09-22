import { multiply, orthographic, translation, type Mat4 } from "../math/mat4";

const DISTANCE = 10;
const DEPTH = 20;

export interface Camera {
  readonly viewProjection: Mat4;
  readonly pixelsPerUnit: number;
}

export function createCamera([width, height]: readonly [number, number], markSize: number): Camera {
  const pixelsPerUnit = markSize / 2;
  const viewProjection = multiply(
    orthographic(width / 2 / pixelsPerUnit, height / 2 / pixelsPerUnit, 0.1, DEPTH),
    translation(0, 0, -DISTANCE),
  );
  return { viewProjection, pixelsPerUnit };
}
