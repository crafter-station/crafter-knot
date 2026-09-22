import * as vec3 from "../math/vec3";
import type { Vec3 } from "../math/vec3";
import { derivative, domain, evaluate, type Spline } from "./spline";

const DENSE = 64;
const CAP_RINGS = 12;

export interface Ring {
  readonly centre: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly binormal: Vec3;
  readonly radius: number;
  readonly slope: number;
  readonly u: number;
}

export interface Strand {
  readonly spline: Spline;
  readonly rings: readonly Ring[];
}

export interface Surface {
  readonly rings: readonly Ring[];
  readonly sides: number;
  readonly positions: Vec3[];
  readonly normals: Vec3[];
  readonly params: number[];
  readonly indices: number[];
}

const xyz = ([x, y, z]: readonly number[]): Vec3 => [x, y, z];

function stations(spline: Spline, spacing: number): number[] {
  const span = domain(spline);
  const steps = span * DENSE;
  const lengths = [0];
  let previous = xyz(evaluate(spline, 0));
  for (let i = 1; i <= steps; i++) {
    const next = xyz(evaluate(spline, (i / steps) * span));
    lengths.push(lengths[i - 1] + vec3.distance(previous, next));
    previous = next;
  }
  const total = lengths[steps];
  const count = Math.max(2, Math.round(total / spacing));
  let k = 0;
  return Array.from({ length: spline.closed ? count : count + 1 }, (_, i) => {
    const target = (i / count) * total;
    while (k < steps - 1 && lengths[k + 1] < target) k++;
    const t = (target - lengths[k]) / (lengths[k + 1] - lengths[k] || 1);
    return ((k + t) / steps) * span;
  });
}

function perpendicular(tangent: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(tangent[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return vec3.normalize(vec3.cross(vec3.cross(tangent, axis), tangent));
}

const reflect = (v: Vec3, axis: Vec3, c: number): Vec3 =>
  vec3.sub(v, vec3.scale(axis, (2 / c) * vec3.dot(axis, v)));

function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return vec3.add(
    vec3.add(vec3.scale(v, cos), vec3.scale(vec3.cross(axis, v), sin)),
    vec3.scale(axis, vec3.dot(axis, v) * (1 - cos)),
  );
}

export function sweep(spline: Spline, spacing: number): Strand {
  const frames = stations(spline, spacing).map((u) => {
    const point = evaluate(spline, u);
    const velocity = derivative(spline, u);
    const speed = vec3.length(xyz(velocity));
    return {
      u,
      centre: xyz(point),
      tangent: vec3.scale(xyz(velocity), 1 / speed),
      radius: point[3],
      slope: velocity[3] / speed,
    };
  });
  const normals: Vec3[] = [perpendicular(frames[0].tangent)];
  for (let i = 0; i + 1 < frames.length + (spline.closed ? 1 : 0); i++) {
    const [a, b] = [frames[i], frames[(i + 1) % frames.length]];
    const step = vec3.sub(b.centre, a.centre);
    const c1 = vec3.dot(step, step);
    const r = reflect(normals[i], step, c1);
    const t = reflect(a.tangent, step, c1);
    const bend = vec3.sub(b.tangent, t);
    const c2 = vec3.dot(bend, bend);
    normals.push(c2 > 1e-12 ? reflect(r, bend, c2) : r);
  }
  if (spline.closed) {
    const [start, end] = [normals[0], normals.pop()!];
    const twist = Math.atan2(vec3.dot(vec3.cross(end, start), frames[0].tangent), vec3.dot(end, start));
    normals.forEach((n, i) => (normals[i] = rotateAbout(n, frames[i].tangent, (twist * i) / frames.length)));
  }
  const rings = frames.map((frame, i) => ({
    ...frame,
    normal: normals[i],
    binormal: vec3.cross(frame.tangent, normals[i]),
  }));
  return { spline, rings };
}

function capped(rings: readonly Ring[]): Ring[] {
  const dome = (ring: Ring, outward: number): Ring[] =>
    Array.from({ length: CAP_RINGS }, (_, k) => {
      const angle = ((k + 1) / CAP_RINGS) * (Math.PI / 2);
      return {
        ...ring,
        centre: vec3.add(ring.centre, vec3.scale(ring.tangent, outward * ring.radius * Math.sin(angle))),
        radius: ring.radius * Math.cos(angle),
        slope: -outward * Math.tan(Math.min(angle, 1.5)),
      };
    });
  return [...dome(rings[0], -1).reverse(), ...rings, ...dome(rings[rings.length - 1], 1)];
}

export function surface({ spline, rings: path }: Strand, sides: number): Surface {
  const rings = spline.closed ? path : capped(path);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const params: number[] = [];
  const indices: number[] = [];
  rings.forEach((ring) => {
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const outward = vec3.add(
        vec3.scale(ring.normal, Math.cos(angle)),
        vec3.scale(ring.binormal, Math.sin(angle)),
      );
      positions.push(vec3.add(ring.centre, vec3.scale(outward, ring.radius)));
      normals.push(vec3.normalize(vec3.sub(outward, vec3.scale(ring.tangent, ring.slope))));
      params.push(ring.u);
    }
  });
  const count = rings.length;
  for (let i = 0; i < (spline.closed ? count : count - 1); i++) {
    const a = i * sides;
    const b = ((i + 1) % count) * sides;
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      indices.push(a + j, a + k, b + j, b + j, a + k, b + k);
    }
  }
  return { rings, sides, positions, normals, params, indices };
}
