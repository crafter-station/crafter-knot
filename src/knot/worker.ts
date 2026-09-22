import { buildKnot, type Shape } from ".";

export interface Request {
  readonly id: number;
  readonly shape: Shape;
}

addEventListener("message", ({ data: { id, shape } }: MessageEvent<Request>) => {
  const mesh = buildKnot(shape);
  const transfer = Object.values(mesh).flatMap((value) => (ArrayBuffer.isView(value) ? [value.buffer] : []));
  postMessage({ id, mesh }, { transfer });
});
