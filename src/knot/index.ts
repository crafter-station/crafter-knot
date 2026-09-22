import { BRIDGE, GAPS, LOOP } from "./strands";
import { domain, type Spline } from "./spline";
import { occlusion } from "./occlusion";
import { surface, sweep } from "./tube";

const SPACING = 0.012;
const SIDES = 64;

const STRANDS: readonly Spline[] = [LOOP, BRIDGE];

export interface Gap {
  readonly from: number;
  readonly to: number;
  readonly period: number;
}

export interface KnotMesh {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly normals: Float32Array<ArrayBuffer>;
  readonly tracks: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
}

export const gaps: readonly Gap[] = GAPS.map(([from, to]) => ({ from, to, period: domain(LOOP) }));

export function healed(gap: Gap, amount: number): Gap {
  const middle = (gap.from + gap.to) / 2;
  return { ...gap, from: gap.from + (middle - gap.from) * amount, to: gap.to - (gap.to - middle) * amount };
}

export function buildKnot(): KnotMesh {
  const strands = STRANDS.map((spline) => sweep(spline, SPACING));
  const surfaces = strands.map((strand) => surface(strand, SIDES));
  const shade = occlusion(
    strands.map((strand) => strand.rings),
    STRANDS.map((spline) => spline.closed),
    surfaces,
  );
  const flatten = (values: readonly (readonly number[])[]) => new Float32Array(values.flat());
  let offset = 0;
  const indices = surfaces.flatMap((s) => {
    const shifted = s.indices.map((i) => i + offset);
    offset += s.positions.length;
    return shifted;
  });
  return {
    positions: flatten(surfaces.flatMap((s) => s.positions)),
    normals: flatten(surfaces.flatMap((s) => s.normals)),
    tracks: flatten(surfaces.flatMap((s, strand) => s.params.map((u, v) => [strand, u, shade[strand][v]]))),
    indices: new Uint32Array(indices),
  };
}
