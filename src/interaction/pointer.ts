import type { Pose } from "./pose";

const ZOOM_SPEED = 0.0018;
const LINE = 16;

export interface Handlers {
  readonly change: () => void;
  readonly zoom: (factor: number) => void;
}

export function attachPointer(element: HTMLElement, pose: Pose, { change, zoom }: Handlers): () => void {
  let active: number | null = null;
  let last = { x: 0, y: 0, time: 0 };

  const down = (event: PointerEvent) => {
    if (active !== null || event.button !== 0) return;
    active = event.pointerId;
    element.setPointerCapture(event.pointerId);
    last = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    pose.grab();
    change();
  };

  const move = (event: PointerEvent) => {
    if (event.pointerId !== active) return;
    const dt = Math.max(1e-3, (event.timeStamp - last.time) / 1000);
    pose.drag(event.clientX - last.x, event.clientY - last.y, dt);
    last = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    change();
  };

  const up = (event: PointerEvent) => {
    if (event.pointerId !== active) return;
    active = null;
    pose.release();
    change();
  };

  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE : 1;
    zoom(Math.exp(-event.deltaY * unit * ZOOM_SPEED * (event.ctrlKey ? 4 : 1)));
  };

  const events = [
    ["pointerdown", down],
    ["pointermove", move],
    ["pointerup", up],
    ["pointercancel", up],
  ] as const;
  events.forEach(([type, handler]) => element.addEventListener(type, handler));
  element.addEventListener("wheel", wheel, { passive: false });
  return () => {
    events.forEach(([type, handler]) => element.removeEventListener(type, handler));
    element.removeEventListener("wheel", wheel);
  };
}
