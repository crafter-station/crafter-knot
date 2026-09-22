import type { Quat } from "./quat";

export type Mat4 = Float32Array<ArrayBuffer>;

export function orthographic(halfWidth: number, halfHeight: number, near: number, far: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1 / halfWidth;
  m[5] = 1 / halfHeight;
  m[10] = -1 / (far - near);
  m[14] = -near / (far - near);
  m[15] = 1;
  return m;
}

export function rotation([x, y, z, w]: Quat): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y + w * z);
  m[2] = 2 * (x * z - w * y);
  m[4] = 2 * (x * y - w * z);
  m[5] = 1 - 2 * (x * x + z * z);
  m[6] = 2 * (y * z + w * x);
  m[8] = 2 * (x * z + w * y);
  m[9] = 2 * (y * z - w * x);
  m[10] = 1 - 2 * (x * x + y * y);
  m[15] = 1;
  return m;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      m[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return m;
}
