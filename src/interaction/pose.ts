import * as quat from "../math/quat";
import type { Quat } from "../math/quat";
import * as vec3 from "../math/vec3";
import type { Vec3 } from "../math/vec3";

const TURN = 0.006;
const FRICTION = 2.4;
const REST = 1e-3;

export interface Pose {
  readonly orientation: Quat;
  readonly moving: boolean;
  grab(): void;
  drag(dx: number, dy: number, dt: number): void;
  release(): void;
  place(orientation: Quat): void;
  spin(degreesPerSecond: number): void;
  step(dt: number): void;
}

function turn(velocity: Vec3, dt: number): Quat {
  const speed = vec3.length(velocity);
  if (speed < 1e-9) return quat.IDENTITY;
  const [x, y, z] = vec3.scale(velocity, Math.sin((speed * dt) / 2) / speed);
  return [x, y, z, Math.cos((speed * dt) / 2)];
}

const normalized = (q: Quat): Quat => {
  const length = Math.hypot(...q) || 1;
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
};

export function createPose(initial: Quat = quat.IDENTITY): Pose {
  let orientation = normalized(initial);
  let velocity: Vec3 = [0, 0, 0];
  let spinning = 0;
  let holding = false;

  return {
    get orientation() {
      return orientation;
    },
    get moving() {
      return holding || spinning !== 0 || vec3.length(velocity) > REST;
    },
    grab() {
      holding = true;
      velocity = [0, 0, 0];
    },
    drag(dx, dy, dt) {
      const delta: Vec3 = [dy * TURN, dx * TURN, 0];
      orientation = normalized(quat.multiply(turn(delta, 1), orientation));
      velocity = vec3.lerp(velocity, vec3.scale(delta, 1 / Math.max(dt, 1 / 240)), Math.min(1, dt * 30));
    },
    release() {
      holding = false;
    },
    place(next) {
      orientation = normalized(next);
      velocity = [0, 0, 0];
    },
    spin(degreesPerSecond) {
      spinning = (degreesPerSecond * Math.PI) / 180;
    },
    step(dt) {
      if (holding) return;
      velocity = vec3.scale(velocity, Math.exp(-FRICTION * dt));
      const drift = vec3.add(velocity, [0, spinning, 0]);
      orientation = normalized(quat.multiply(turn(drift, dt), orientation));
    },
  };
}
