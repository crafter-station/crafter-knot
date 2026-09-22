import type { Look } from "../state/look";
import { occlusion } from "./occlusion";
import { domain } from "./spline";
import { BRIDGE, LOOP, PIECES } from "./strands";
import { surface, sweep, type Profile } from "./tube";

const SPACING = 0.012;
const SMOOTH = 64;

export type Shape = Pick<Look, "facets" | "twist" | "ends">;

export interface KnotMesh {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly normals: Float32Array<ArrayBuffer>;
  readonly cores: Float32Array<ArrayBuffer>;
  readonly coords: Float32Array<ArrayBuffer>;
  readonly occlusion: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
}

const paths = [
  ...PIECES.map((span) => sweep(LOOP, span, SPACING)),
  sweep(BRIDGE, [0, domain(BRIDGE)], SPACING),
];

export const MEAN_RADIUS =
  paths.flat().reduce((sum, ring) => sum + ring.radius, 0) /
  paths.reduce((count, path) => count + path.length, 0);

export function buildKnot({ facets, twist, ends }: Shape): KnotMesh {
  const profile: Profile = { sides: facets || SMOOTH, faceted: facets > 0, flat: ends === "flat", twist };
  const surfaces = paths.map((path) => surface(path, profile));
  const shade = occlusion(paths, surfaces);
  let offset = 0;
  const indices = surfaces.flatMap(({ indices, positions }) => {
    const shifted = indices.map((i) => i + offset);
    offset += positions.length;
    return shifted;
  });
  const pack = (pick: (s: (typeof surfaces)[number]) => readonly (readonly number[])[]) =>
    new Float32Array(surfaces.flatMap((s) => pick(s).flat()));
  return {
    positions: pack((s) => s.positions),
    normals: pack((s) => s.normals),
    cores: pack((s) => s.cores),
    coords: pack((s) => s.coords),
    occlusion: new Float32Array(shade.flat()),
    indices: new Uint32Array(indices),
  };
}
