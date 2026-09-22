import type { Pose } from "./pose";

export function attachPointer(element: HTMLElement, pose: Pose, onChange: () => void): () => void {
  let active: number | null = null;
  let last = { x: 0, y: 0, time: 0 };

  const down = (event: PointerEvent) => {
    if (active !== null || event.button !== 0) return;
    active = event.pointerId;
    element.setPointerCapture(event.pointerId);
    last = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    pose.grab();
    onChange();
  };

  const move = (event: PointerEvent) => {
    if (event.pointerId !== active) return;
    const dt = Math.max(1e-3, (event.timeStamp - last.time) / 1000);
    pose.drag(event.clientX - last.x, event.clientY - last.y, dt);
    last = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    onChange();
  };

  const up = (event: PointerEvent) => {
    if (event.pointerId !== active) return;
    active = null;
    pose.release();
    onChange();
  };

  const events = [
    ["pointerdown", down],
    ["pointermove", move],
    ["pointerup", up],
    ["pointercancel", up],
  ] as const;
  events.forEach(([type, handler]) => element.addEventListener(type, handler));
  return () => events.forEach(([type, handler]) => element.removeEventListener(type, handler));
}
