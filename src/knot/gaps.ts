import * as vec3 from "../math/vec3";
import type { Vec3 } from "../math/vec3";
import type { Ring } from "./tube";

const WINDOW = 0.4;

type Path = readonly Ring[];

export interface Gap {
  readonly path: number;
  readonly outward: -1 | 1;
  readonly facing: Path;
  readonly rest: Path;
  readonly width: number;
}

const tip = (ring: Ring, outward: number, thickness: number): Vec3 =>
  vec3.add(ring.centre, vec3.scale(ring.tangent, outward * ring.radius * thickness));

const clearance = (point: Vec3, rings: Path, thickness: number) =>
  rings.reduce(
    (nearest, ring) => Math.min(nearest, vec3.distance(point, ring.centre) - ring.radius * thickness),
    Infinity,
  );

const endOf = (path: Path, outward: number, k: number) => path[outward < 0 ? k : path.length - 1 - k];

export function findGaps(paths: readonly Path[], ends: number): Gap[] {
  return Array.from({ length: ends }, (_, path) =>
    ([-1, 1] as const).map((outward): Gap => {
      const point = tip(endOf(paths[path], outward, 0), outward, 1);
      const others = paths.filter((_, i) => i !== path);
      const reach = (ring: Ring) => vec3.distance(point, ring.centre) - ring.radius;
      const [strand, partner] = others
        .flatMap((rings) => rings.map((ring) => [rings, ring] as const))
        .reduce((best, next) => (reach(next[1]) < reach(best[1]) ? next : best));
      const facing = strand.filter((ring) => Math.abs(ring.along - partner.along) < WINDOW);
      const rest = others.flat().filter((ring) => !facing.includes(ring));
      return { path, outward, facing, rest, width: clearance(point, facing, 1) };
    }),
  ).flat();
}

export function openGaps(paths: readonly Path[], gaps: readonly Gap[], thickness: number): Path[] {
  const cuts = paths.map(() => [0, 0]);
  for (const { path, outward, facing, rest, width } of gaps) {
    const rings = paths[path];
    const ring = (k: number) => endOf(rings, outward, k);
    const open = (k: number) =>
      clearance(tip(ring(k), outward, thickness), facing, thickness) >= width * thickness;
    const free = (k: number) => clearance(ring(k).centre, rest, thickness) >= ring(k).radius * thickness;
    let k = 0;
    while (k + 1 < rings.length / 2 && !open(k) && free(k + 1)) k++;
    cuts[path][outward < 0 ? 0 : 1] = k;
  }
  return paths.map((rings, i) => rings.slice(cuts[i][0], rings.length - cuts[i][1]));
}
