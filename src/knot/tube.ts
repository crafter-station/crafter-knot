import * as vec3 from "../math/vec3";
import type { Vec3 } from "../math/vec3";
import { derivative, domain, evaluate, type Spline } from "./spline";

const DENSE = 64;
const CAP_RINGS = 12;
const TAU = Math.PI * 2;

export type Span = readonly [from: number, to: number];

export interface Ring {
  readonly centre: Vec3;
  readonly core: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly binormal: Vec3;
  readonly radius: number;
  readonly lean: number;
  readonly along: number;
}

export interface Profile {
  readonly sides: number;
  readonly faceted: boolean;
  readonly flat: boolean;
  readonly twist: number;
}

export interface Surface {
  readonly rings: readonly Ring[];
  readonly positions: Vec3[];
  readonly normals: Vec3[];
  readonly cores: Vec3[];
  readonly coords: [number, number][];
  readonly owners: number[];
  readonly indices: number[];
}

const xyz = ([x, y, z]: readonly number[]): Vec3 => [x, y, z];

function stations(spline: Spline, [from, to]: Span, spacing: number): number[] {
  const period = domain(spline);
  const at = (t: number) => from + (to - from) * t;
  const place = (u: number) => xyz(evaluate(spline, spline.closed ? u % period : u));
  const steps = Math.ceil((to - from) * DENSE);
  const lengths = [0];
  let previous = place(from);
  for (let i = 1; i <= steps; i++) {
    const next = place(at(i / steps));
    lengths.push(lengths[i - 1] + vec3.distance(previous, next));
    previous = next;
  }
  const count = Math.max(2, Math.round(lengths[steps] / spacing));
  let k = 0;
  return Array.from({ length: count + 1 }, (_, i) => {
    const target = (i / count) * lengths[steps];
    while (k < steps - 1 && lengths[k + 1] < target) k++;
    const t = (target - lengths[k]) / (lengths[k + 1] - lengths[k] || 1);
    const u = at((k + t) / steps);
    return spline.closed ? u % period : u;
  });
}

function perpendicular(tangent: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(tangent[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return vec3.normalize(vec3.cross(vec3.cross(tangent, axis), tangent));
}

const reflect = (v: Vec3, axis: Vec3, c: number): Vec3 =>
  vec3.sub(v, vec3.scale(axis, (2 / c) * vec3.dot(axis, v)));

export function sweep(spline: Spline, span: Span, spacing: number): Ring[] {
  const frames = stations(spline, span, spacing).map((u) => {
    const point = evaluate(spline, u);
    const velocity = derivative(spline, u);
    const speed = vec3.length(xyz(velocity));
    return {
      centre: xyz(point),
      core: xyz(point),
      tangent: vec3.scale(xyz(velocity), 1 / speed),
      radius: point[3],
      lean: Math.atan(velocity[3] / speed),
    };
  });
  const normals: Vec3[] = [perpendicular(frames[0].tangent)];
  const distances = [0];
  for (let i = 0; i + 1 < frames.length; i++) {
    const [a, b] = [frames[i], frames[i + 1]];
    const step = vec3.sub(b.centre, a.centre);
    const c1 = vec3.dot(step, step);
    const r = reflect(normals[i], step, c1);
    const bend = vec3.sub(b.tangent, reflect(a.tangent, step, c1));
    const c2 = vec3.dot(bend, bend);
    normals.push(c2 > 1e-12 ? reflect(r, bend, c2) : r);
    distances.push(distances[i] + Math.sqrt(c1));
  }
  return frames.map((frame, i) => ({
    ...frame,
    normal: normals[i],
    binormal: vec3.cross(frame.tangent, normals[i]),
    along: distances[i],
  }));
}

function domes(rings: readonly Ring[]): Ring[] {
  const dome = (ring: Ring, outward: number): Ring[] =>
    Array.from({ length: CAP_RINGS }, (_, k) => {
      const angle = ((k + 1) / CAP_RINGS) * (Math.PI / 2);
      const reach = ring.radius * Math.sin(angle);
      return {
        ...ring,
        centre: vec3.add(ring.centre, vec3.scale(ring.tangent, outward * reach)),
        radius: ring.radius * Math.cos(angle),
        lean: -outward * angle,
        along: ring.along + outward * reach,
      };
    });
  return [...dome(rings[0], -1).reverse(), ...rings, ...dome(rings[rings.length - 1], 1)];
}

function discs(rings: readonly Ring[]): Ring[] {
  const disc = (ring: Ring, outward: number): Ring[] => [
    { ...ring, lean: (-outward * Math.PI) / 2 },
    { ...ring, radius: 0, lean: (-outward * Math.PI) / 2 },
  ];
  return [...disc(rings[0], -1).reverse(), ...rings, ...disc(rings[rings.length - 1], 1)];
}

function around(ring: Ring, turn: number): { outward: Vec3; normal: Vec3 } {
  const angle = turn * TAU;
  const outward = vec3.add(
    vec3.scale(ring.normal, Math.cos(angle)),
    vec3.scale(ring.binormal, Math.sin(angle)),
  );
  const normal = vec3.sub(
    vec3.scale(outward, Math.cos(ring.lean)),
    vec3.scale(ring.tangent, Math.sin(ring.lean)),
  );
  return { outward, normal };
}

export function surface(path: readonly Ring[], { sides, faceted, flat, twist }: Profile): Surface {
  const rings = flat ? discs(path) : domes(path);
  const out: Surface = { rings, positions: [], normals: [], cores: [], coords: [], owners: [], indices: [] };
  const turnOf = (ring: Ring, j: number) => j / sides + twist * ring.along;
  const emit = (ring: Ring, owner: number, turn: number, normal: Vec3) => {
    out.positions.push(vec3.add(ring.centre, vec3.scale(around(ring, turn).outward, ring.radius)));
    out.normals.push(normal);
    out.cores.push(ring.core);
    out.coords.push([ring.along, turn]);
    out.owners.push(owner);
    return out.positions.length - 1;
  };
  if (faceted) {
    for (let i = 0; i + 1 < rings.length; i++) {
      const [a, b] = [rings[i], rings[i + 1]];
      for (let j = 0; j < sides; j++) {
        const middle = (ring: Ring) => around(ring, turnOf(ring, j + 0.5)).normal;
        const normal = vec3.normalize(vec3.add(middle(a), middle(b)));
        const quad = [
          emit(a, i, turnOf(a, j), normal),
          emit(a, i, turnOf(a, j + 1), normal),
          emit(b, i + 1, turnOf(b, j), normal),
          emit(b, i + 1, turnOf(b, j + 1), normal),
        ];
        out.indices.push(quad[0], quad[1], quad[2], quad[2], quad[1], quad[3]);
      }
    }
    return out;
  }
  const row = sides + 1;
  rings.forEach((ring, i) => {
    for (let j = 0; j <= sides; j++) emit(ring, i, turnOf(ring, j), around(ring, turnOf(ring, j)).normal);
    if (i + 1 < rings.length)
      for (let j = 0; j < sides; j++) {
        const [a, b] = [i * row + j, (i + 1) * row + j];
        out.indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
  });
  return out;
}
