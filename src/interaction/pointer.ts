import type { Pose } from "./pose";

const ZOOM_SPEED = 0.0018;
const LINE = 16;
const MIN_SPAN = 12;

export interface Handlers {
  readonly change: () => void;
  readonly zoom: (factor: number) => void;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** One finger turns. Two fingers pinch to zoom while their midpoint keeps turning. */
export function attachPointer(element: HTMLElement, pose: Pose, { change, zoom }: Handlers): () => void {
  const fingers = new Map<number, Point>();
  let last: Point & { time: number } = { x: 0, y: 0, time: 0 };
  let span = 0;

  const hand = (): { point: Point; span: number } => {
    const [a, b] = fingers.values();
    if (!b) return { point: a, span: 0 };
    return { point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, span: Math.hypot(b.x - a.x, b.y - a.y) };
  };

  const reseed = (time: number) => {
    const now = hand();
    last = { ...now.point, time };
    span = now.span;
  };

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || fingers.size >= 2 || fingers.has(event.pointerId)) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    element.setPointerCapture(event.pointerId);
    if (fingers.size === 1) pose.grab();
    reseed(event.timeStamp);
    change();
  };

  const move = (event: PointerEvent) => {
    if (!fingers.has(event.pointerId)) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const now = hand();
    const dt = Math.max(1e-3, (event.timeStamp - last.time) / 1000);
    pose.drag(now.point.x - last.x, now.point.y - last.y, dt);
    if (span > MIN_SPAN && now.span > MIN_SPAN) zoom(now.span / span);
    last = { ...now.point, time: event.timeStamp };
    span = now.span;
    change();
  };

  const up = (event: PointerEvent) => {
    if (!fingers.delete(event.pointerId)) return;
    if (fingers.size === 0) pose.release();
    else reseed(event.timeStamp);
    change();
  };

  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE : 1;
    zoom(Math.exp(-event.deltaY * unit * ZOOM_SPEED * (event.ctrlKey ? 4 : 1)));
  };

  const prevent = (event: Event) => event.preventDefault();

  const events = [
    ["pointerdown", down],
    ["pointermove", move],
    ["pointerup", up],
    ["pointercancel", up],
  ] as const;
  events.forEach(([type, handler]) => element.addEventListener(type, handler));
  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("gesturestart", prevent, { passive: false });
  return () => {
    events.forEach(([type, handler]) => element.removeEventListener(type, handler));
    element.removeEventListener("wheel", wheel);
    element.removeEventListener("gesturestart", prevent);
  };
}
