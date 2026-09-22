import * as vec3 from "../math/vec3";
import type { Ring, Surface } from "./tube";

const REACH = 6;
const OWN = 3;
const STRENGTH = 1.1;

interface Probe {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly strand: number;
  readonly weight: number;
}

function probes(strands: readonly (readonly Ring[])[], closed: readonly boolean[]): Probe[] {
  return strands.flatMap((rings, strand) =>
    rings.map((ring, i) => {
      const neighbour = i + 1 < rings.length ? rings[i + 1] : closed[strand] ? rings[0] : rings[i - 1];
      const [x, y, z] = ring.centre;
      const weight = vec3.distance(ring.centre, neighbour.centre) / (2 * ring.radius);
      return { x, y, z, radius: ring.radius, strand, weight };
    }),
  );
}

export function occlusion(
  strands: readonly (readonly Ring[])[],
  closed: readonly boolean[],
  surfaces: readonly Surface[],
): number[][] {
  const all = probes(strands, closed);
  return surfaces.map(({ rings, sides, positions, normals }, strand) => {
    const nearby = rings.map(({ centre: [cx, cy, cz], radius }) =>
      all.filter((p) => {
        const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
        return d < (REACH + 1) * p.radius + radius && !(p.strand === strand && d < OWN * p.radius);
      }),
    );
    return positions.map(([px, py, pz], v) => {
      const [nx, ny, nz] = normals[v];
      let sum = 0;
      for (const p of nearby[Math.floor(v / sides)]) {
        const x = p.x - px;
        const y = p.y - py;
        const z = p.z - pz;
        const squared = Math.max(x * x + y * y + z * z, p.radius * p.radius);
        const along = nx * x + ny * y + nz * z;
        if (along > 0 && squared < (REACH * p.radius) ** 2)
          sum += (along / Math.sqrt(squared)) * ((p.radius * p.radius) / squared) * p.weight;
      }
      return Math.max(0, 1 - STRENGTH * sum);
    });
  });
}
