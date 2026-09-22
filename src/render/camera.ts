import { multiply, orthographic, perspective, translation, type Mat4 } from "../math/mat4";

const DISTANCE = 10;
const DEPTH = 20;
const REACH = 4;

export interface Camera {
  readonly viewProjection: Mat4;
  readonly eye: readonly [number, number, number, number];
}

export function createCamera(
  [width, height]: readonly [number, number],
  markSize: number,
  fov: number,
): Camera {
  const halfHeight = height / markSize;
  const aspect = width / height;
  if (fov < 0.5) {
    return {
      viewProjection: multiply(
        orthographic(halfHeight * aspect, halfHeight, 0.1, DEPTH),
        translation(0, 0, -DISTANCE),
      ),
      eye: [0, 0, 1, 0],
    };
  }
  const angle = (fov * Math.PI) / 180;
  const distance = halfHeight / Math.tan(angle / 2);
  return {
    viewProjection: multiply(
      perspective(angle, aspect, Math.max(0.01, distance - REACH), distance + REACH),
      translation(0, 0, -distance),
    ),
    eye: [0, 0, distance, 1],
  };
}
