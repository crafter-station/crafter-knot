import type { KnotMesh, Shape } from ".";
import type { Request } from "./worker";

export interface Builder {
  build(shape: Shape): Promise<KnotMesh>;
}

export function createBuilder(): Builder {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (mesh: KnotMesh) => void>();
  let next = 0;
  worker.addEventListener("message", ({ data }: MessageEvent<{ id: number; mesh: KnotMesh }>) => {
    pending.get(data.id)?.(data.mesh);
    pending.delete(data.id);
  });
  return {
    build: (shape) =>
      new Promise((resolve) => {
        const id = next++;
        pending.set(id, resolve);
        worker.postMessage({ id, shape } satisfies Request);
      }),
  };
}
