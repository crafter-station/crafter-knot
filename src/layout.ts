const COMPACT = 640;

export type Layout = (width: number, height: number) => number;

export const layout =
  (share?: number): Layout =>
  (width, height) => {
    const side = Math.min(width, height);
    return (share ?? (side < COMPACT ? 0.74 : 0.56)) * side;
  };
