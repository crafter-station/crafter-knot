import {
  derivative,
  domain,
  evaluate,
  weights,
  type Knot,
  type Spline,
  type Weight,
} from "../src/knot/spline";

type P = readonly [number, number];

interface Sample {
  readonly point: P;
  readonly normal: P;
  readonly segment: number;
}

interface Plan {
  readonly name: string;
  readonly closed: boolean;
  readonly sides: readonly number[];
  readonly path: readonly (readonly number[])[];
  readonly knots: number;
}

interface Row {
  readonly terms: readonly Weight[];
  readonly target: readonly number[];
  readonly weight: number;
}

interface Foot {
  readonly u: number;
  readonly distance: number;
}

const MARK = new URL("../src/knot/mark.svg", import.meta.url);
const OUTPUT = new URL("../src/knot/strands.ts", import.meta.url);
const CAPS = [[4, 5], [10], [24, 25], [30]];
const SPACING = 0.75;
const DENSITY = 48;
const ITERATIONS = 120;
const BEND = 0.4;
const SWELL = 4;
const ANCHOR = 400;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const PLANS: readonly Plan[] = [
  {
    name: "LOOP",
    closed: true,
    sides: [...range(0, 3), ...range(6, 9), 11, 12, ...range(21, 23), ...range(26, 29), 31, 32, 41],
    path: [range(6, 9), range(26, 29)],
    knots: 40,
  },
  {
    name: "BRIDGE",
    closed: false,
    sides: [...range(13, 20), ...range(33, 40)],
    path: [range(13, 20)],
    knots: 38,
  },
];

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const scale = (a: P, s: number): P => [a[0] * s, a[1] * s];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const length = (a: P) => Math.hypot(a[0], a[1]);
const flat = (k: Knot): P => [k[0], k[1]];

function parse(svg: string): P[][] {
  const tokens = svg.match(/ d="([^"]+)"/)?.[1].match(/[MCLZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const segments: P[][] = [];
  let cursor: P = [0, 0];
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    const read = (): P => [Number(tokens[i++]), Number(tokens[i++])];
    if (command === "M") cursor = read();
    if (command === "C") segments.push([cursor, read(), read(), (cursor = read())]);
    if (command === "L") {
      const [from, to] = [cursor, (cursor = read())];
      segments.push([
        from,
        add(from, scale(sub(to, from), 1 / 3)),
        add(from, scale(sub(to, from), 2 / 3)),
        to,
      ]);
    }
  }
  return segments;
}

function bezier([a, b, c, d]: readonly P[], t: number): { point: P; tangent: P } {
  const s = 1 - t;
  const at = (i: 0 | 1) => s * s * s * a[i] + 3 * s * s * t * b[i] + 3 * s * t * t * c[i] + t * t * t * d[i];
  const slope = (i: 0 | 1) =>
    3 * s * s * (b[i] - a[i]) + 6 * s * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i]);
  return { point: [at(0), at(1)], tangent: [slope(0), slope(1)] };
}

function outline(segments: readonly P[][]): Sample[] {
  const samples: Sample[] = [];
  segments.forEach((segment, index) => {
    let travelled = SPACING;
    let previous = segment[0];
    for (let step = 0; step <= 2000; step++) {
      const { point, tangent } = bezier(segment, step / 2000);
      travelled += length(sub(point, previous));
      previous = point;
      const l = length(tangent);
      if (travelled < SPACING || l < 1e-9) continue;
      travelled = 0;
      samples.push({ point, normal: [-tangent[1] / l, tangent[0] / l], segment: index });
    }
  });
  const inside = (p: P) =>
    samples.reduce((odd, { point: a }, i) => {
      const b = samples[(i + 1) % samples.length].point;
      const crosses =
        a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      return crosses ? !odd : odd;
    }, false);
  const votes = samples.filter((_, i) => i % 25 === 0).map((s) => (inside(add(s.point, s.normal)) ? 1 : -1));
  const sign = Math.sign(votes.reduce<number>((sum, v) => sum + v, 0));
  return samples.map((s) => ({ ...s, normal: scale(s.normal, sign) }));
}

function halfWidth(samples: readonly Sample[], sides: readonly Sample[]): number {
  const widths = sides
    .filter((_, i) => i % 5 === 0)
    .map((s) =>
      samples.reduce((nearest, { point: a }, j) => {
        const edge = sub(samples[(j + 1) % samples.length].point, a);
        const denominator = cross(s.normal, edge);
        if (Math.abs(denominator) < 1e-12) return nearest;
        const offset = sub(a, s.point);
        const t = cross(offset, edge) / denominator;
        const v = cross(offset, s.normal) / denominator;
        return t > 2 && v >= 0 && v <= 1 ? Math.min(nearest, t) : nearest;
      }, Infinity),
    )
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return widths[widths.length >> 1] / 2;
}

function resample(polyline: readonly P[], count: number, closed: boolean): P[] {
  const ring = closed ? [...polyline, polyline[0]] : polyline;
  const lengths = [0];
  ring.slice(1).forEach((p, i) => lengths.push(lengths[i] + length(sub(p, ring[i]))));
  const total = lengths[lengths.length - 1];
  return Array.from({ length: count }, (_, i) => {
    const target = (i / (closed ? count : count - 1)) * total;
    const k = Math.min(ring.length - 2, Math.max(0, lengths.findIndex((l) => l >= target) - 1));
    const t = (target - lengths[k]) / (lengths[k + 1] - lengths[k] || 1);
    return add(ring[k], scale(sub(ring[k + 1], ring[k]), t));
  });
}

function solve(matrix: readonly number[][], rhs: readonly number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    const pivot = a.reduce(
      (best, row, r) => (r >= c && Math.abs(row[c]) > Math.abs(a[best][c]) ? r : best),
      c,
    );
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = a[r][n];
    for (let k = r + 1; k < n; k++) sum -= a[r][k] * x[k];
    x[r] = sum / a[r][r];
  }
  return x;
}

function leastSquares(count: number, closed: boolean, rows: readonly Row[], smoothing: number): number[][] {
  const dimensions = rows[0].target.length;
  const normal = Array.from({ length: count }, () => new Array<number>(count).fill(0));
  const rhs = Array.from({ length: dimensions }, () => new Array<number>(count).fill(0));
  const accumulate = ({ terms, target, weight }: Row) => {
    for (const [i, wi] of terms) {
      for (const [j, wj] of terms) normal[i][j] += weight * wi * wj;
      target.forEach((value, d) => (rhs[d][i] += weight * wi * value));
    }
  };
  rows.forEach(accumulate);
  const bends = closed ? range(0, count - 1) : range(1, count - 2);
  bends.forEach((i) =>
    accumulate({
      terms: [-1, 0, 1].map((o): Weight => [(i + o + count) % count, o ? 1 : -2]),
      target: new Array<number>(dimensions).fill(0),
      weight: smoothing,
    }),
  );
  return rhs.map((b) => solve(normal, b));
}

const planar = (closed: boolean, points: readonly P[], radius = 0): Spline => ({
  closed,
  knots: points.map(([x, y]): Knot => [x, y, 0, radius]),
});

function table(spline: Spline): { u: number; p: P }[] {
  const steps = domain(spline) * DENSITY + (spline.closed ? 0 : 1);
  return Array.from({ length: steps }, (_, i) => ({
    u: i / DENSITY,
    p: flat(evaluate(spline, i / DENSITY)),
  }));
}

function foot(lookup: readonly { u: number; p: P }[], q: P): Foot {
  let best: Foot = { u: 0, distance: Infinity };
  for (const { u, p } of lookup) {
    const distance = length(sub(p, q));
    if (distance < best.distance) best = { u, distance };
  }
  return best;
}

function centreline(plan: Plan, data: readonly P[], initial: readonly P[], anchor?: (end: P) => P): P[] {
  let points = initial;
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const lookup = table(planar(plan.closed, points));
    const rows: Row[] = data.map((q) => ({
      terms: weights(points.length, plan.closed, foot(lookup, q).u),
      target: q,
      weight: 1,
    }));
    if (anchor)
      [0, points.length - 1].forEach((i) =>
        rows.push({ terms: [[i, 1]], target: anchor(points[i]), weight: ANCHOR }),
      );
    const [xs, ys] = leastSquares(points.length, plan.closed, rows, BEND);
    points = xs.map((x, i) => [x, ys[i]]);
  }
  return points;
}

function thickness(plan: Plan, points: readonly P[], edges: readonly Sample[]): number[] {
  const lookup = table(planar(plan.closed, points));
  const rows = edges.map((s): Row => {
    const { u, distance } = foot(lookup, s.point);
    return { terms: weights(points.length, plan.closed, u), target: [distance], weight: 1 };
  });
  return leastSquares(points.length, plan.closed, rows, SWELL)[0];
}

function pieces(
  loop: Spline,
  edges: readonly Sample[],
  caps: readonly (readonly Sample[])[],
): [number, number][] {
  const period = domain(loop);
  const lookup = table(loop);
  const covered = edges.map((s) => foot(lookup, s.point).u).sort((a, b) => a - b);
  const spans = covered.map(
    (u, i) => [u, i + 1 < covered.length ? covered[i + 1] : covered[0] + period] as const,
  );
  const gaps = [...spans].sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, 2);
  const hidden = gaps.map(([from, to]) => {
    const relative = (u: number) => {
      const r = (((u - from) % period) + period) % period;
      return r > period / 2 ? r - period : r;
    };
    const feet = caps.map((cap) => cap.map((s) => relative(foot(lookup, s.point).u)));
    const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const closest = (target: number) =>
      feet.reduce((best, f) => (Math.abs(mean(f) - target) < Math.abs(mean(best) - target) ? f : best));
    const back = (u: number) => {
      const [, , , radius] = evaluate(loop, u);
      const [dx, dy] = derivative(loop, u);
      return radius / Math.hypot(dx, dy);
    };
    const low = from + Math.max(...closest(0));
    const high = from + Math.min(...closest(to - from));
    return [low - back(low), high + back(high)] as const;
  });
  const wrap = (u: number) => ((u % period) + period) % period;
  return hidden.map(([, end], i) => {
    const start = wrap(end);
    const next = wrap(hidden[(i + 1) % hidden.length][0]);
    return [start, next > start ? next : next + period];
  });
}

function report(name: string, spline: Spline, edges: readonly Sample[]) {
  const lookup = table(spline);
  const errors = edges
    .map((s) => {
      const { u, distance } = foot(lookup, s.point);
      return Math.abs(distance - evaluate(spline, u)[3]);
    })
    .sort((a, b) => a - b);
  const rms = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
  const at = (q: number) => errors[Math.floor(q * (errors.length - 1))].toFixed(3);
  console.log(`${name} edge rms ${rms.toFixed(3)} p99 ${at(0.99)} max ${at(1)}`);
}

const segments = parse(await Bun.file(MARK).text());
const samples = outline(segments);
const strandOf = new Map(PLANS.flatMap((plan) => plan.sides.map((side) => [side, plan.name] as const)));
const corners = segments
  .map((segment, i) => ({
    point: segment[0],
    joins: [strandOf.get((i + segments.length - 1) % segments.length), strandOf.get(i)],
  }))
  .filter(({ joins: [a, b] }) => a && b && a !== b)
  .map(({ point }) => point);
const capped = samples.filter((s) => CAPS.flat().includes(s.segment)).map((s) => s.point);
const rough = halfWidth(
  samples,
  samples.filter((s) => strandOf.has(s.segment)),
);
const clean = (s: Sample) => [...capped, ...corners].every((p) => length(sub(p, s.point)) > rough);

const strands = new Map<string, Spline>();
for (const plan of PLANS) {
  const edges = samples.filter((s) => plan.sides.includes(s.segment) && clean(s));
  const inward = (s: Sample): P => add(s.point, scale(s.normal, rough));
  const initial = plan.path.flatMap((group) => samples.filter((s) => group.includes(s.segment)).map(inward));
  const loop = strands.get("LOOP");
  const anchor = loop && ((end: P) => flat(evaluate(loop, foot(table(loop), end).u)));
  const points = centreline(plan, edges.map(inward), resample(initial, plan.knots, plan.closed), anchor);
  const radii = thickness(plan, points, edges);
  const spline: Spline = { closed: plan.closed, knots: points.map(([x, y], i): Knot => [x, y, 0, radii[i]]) };
  report(plan.name, spline, edges);
  strands.set(plan.name, spline);
}

const loop = strands.get("LOOP")!;
const loopEdges = samples.filter((s) => PLANS[0].sides.includes(s.segment) && clean(s));
const capEdges = CAPS.map((cap) => samples.filter((s) => cap.includes(s.segment)));
const visible = pieces(loop, loopEdges, capEdges);
console.log(`pieces ${visible.map((g) => g.map((u) => u.toFixed(2)).join("-")).join(" ")}`);

const xs = samples.map((s) => s.point[0]);
const ys = samples.map((s) => s.point[1]);
const centre: P = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
const unit = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
const model = ([x, y, z, r]: Knot) => [(x - centre[0]) / unit, (centre[1] - y) / unit, z / unit, r / unit];
const tuple = (values: readonly number[]) => `[${values.map((v) => Number(v.toFixed(5))).join(", ")}]`;
const literal = ({ closed, knots }: Spline) =>
  `{\n  closed: ${closed},\n  knots: [\n${knots.map((k) => `    ${tuple(model(k))},`).join("\n")}\n  ],\n}`;

await Bun.write(
  OUTPUT,
  [
    `import type { Spline } from "./spline";`,
    ...PLANS.map((plan) => `export const ${plan.name}: Spline = ${literal(strands.get(plan.name)!)};`),
    `export const MARK = { centre: ${tuple(centre)}, unit: ${Number(unit.toFixed(5))} } as const;`,
    `export const PIECES: readonly (readonly [number, number])[] = [${visible.map(tuple).join(", ")}];`,
  ].join("\n\n") + "\n",
);
console.log(`centre ${tuple(centre)} unit ${unit.toFixed(2)} half width ${rough.toFixed(2)}`);
