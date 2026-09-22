import { multiply, orthographic, translation, type Mat4 } from "../math/mat4";

const DISTANCE = 10;
const DEPTH = 20;

export function viewProjection([width, height]: readonly [number, number], markSize: number): Mat4 {
  const scale = 2 / markSize;
  return multiply(
    orthographic((width / 2) * scale, (height / 2) * scale, 0.1, DEPTH),
    translation(0, 0, -DISTANCE),
  );
}
