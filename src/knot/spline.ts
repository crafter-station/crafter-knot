export type Knot = readonly [x: number, y: number, z: number, radius: number];

export interface Spline {
  readonly closed: boolean;
  readonly knots: readonly Knot[];
}

export type Weight = readonly [index: number, weight: number];

const basis = (t: number): readonly number[] => {
  const s = 1 - t;
  return [
    (s * s * s) / 6,
    (3 * t * t * t - 6 * t * t + 4) / 6,
    (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6,
    (t * t * t) / 6,
  ];
};

const slope = (t: number): readonly number[] => {
  const s = 1 - t;
  return [(-s * s) / 2, 1.5 * t * t - 2 * t, -1.5 * t * t + t + 0.5, (t * t) / 2];
};

export const spanCount = (count: number, closed: boolean): number => (closed ? count : count - 1);

export function weights(count: number, closed: boolean, u: number, derivative = false): Weight[] {
  const span = Math.min(spanCount(count, closed) - 1, Math.max(0, Math.floor(u)));
  const terms: Weight[] = [];
  (derivative ? slope : basis)(u - span).forEach((w, k) => {
    const index = span - 1 + k;
    if (closed) terms.push([(index + count) % count, w]);
    else if (index < 0) terms.push([0, 2 * w], [1, -w]);
    else if (index >= count) terms.push([count - 1, 2 * w], [count - 2, -w]);
    else terms.push([index, w]);
  });
  return terms;
}

function combine(knots: readonly Knot[], terms: readonly Weight[]): Knot {
  const out = [0, 0, 0, 0];
  for (const [index, w] of terms) for (let c = 0; c < 4; c++) out[c] += knots[index][c] * w;
  return [out[0], out[1], out[2], out[3]];
}

export const domain = ({ closed, knots }: Spline): number => spanCount(knots.length, closed);

export const evaluate = ({ closed, knots }: Spline, u: number): Knot =>
  combine(knots, weights(knots.length, closed, u));

export const derivative = ({ closed, knots }: Spline, u: number): Knot =>
  combine(knots, weights(knots.length, closed, u, true));
