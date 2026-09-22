import { occlusion } from "./occlusion";
import { domain } from "./spline";
import { BRIDGE, LOOP, PIECES } from "./strands";
import { surface, sweep } from "./tube";

const SPACING = 0.012;
const SIDES = 64;

export interface KnotMesh {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly normals: Float32Array<ArrayBuffer>;
  readonly occlusion: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
}

export function buildKnot(): KnotMesh {
  const paths = [
    ...PIECES.map((span) => sweep(LOOP, span, SPACING)),
    sweep(BRIDGE, [0, domain(BRIDGE)], SPACING),
  ];
  const surfaces = paths.map((path) => surface(path, SIDES));
  const shade = occlusion(paths, surfaces);
  let offset = 0;
  const indices = surfaces.flatMap(({ indices, positions }) => {
    const shifted = indices.map((i) => i + offset);
    offset += positions.length;
    return shifted;
  });
  return {
    positions: new Float32Array(surfaces.flatMap((s) => s.positions.flat())),
    normals: new Float32Array(surfaces.flatMap((s) => s.normals.flat())),
    occlusion: new Float32Array(shade.flat()),
    indices: new Uint32Array(indices),
  };
}
