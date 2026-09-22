import * as quat from "../math/quat";
import type { Quat } from "../math/quat";
import * as vec3 from "../math/vec3";
import type { Vec3 } from "../math/vec3";

const TURN = 0.006;
const FRICTION = 2.4;
const HOLD = 1.1;
const STIFFNESS = 26;
const DAMPING = 7.5;
const REST = 1e-3;
const KICK: Vec3 = [0.35, 3.1, 0];

export interface Pose {
  readonly orientation: Quat;
  readonly moving: boolean;
  grab(): void;
  drag(dx: number, dy: number, dt: number): void;
  release(): void;
  nudge(): void;
  step(dt: number): void;
}

function spin(velocity: Vec3, dt: number): Quat {
  const speed = vec3.length(velocity);
  if (speed < 1e-9) return quat.IDENTITY;
  const [x, y, z] = vec3.scale(velocity, Math.sin((speed * dt) / 2) / speed);
  return [x, y, z, Math.cos((speed * dt) / 2)];
}

const positive = (q: Quat): Quat => (q[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q);

function tilt(orientation: Quat): Vec3 {
  const [x, y, z, w] = positive(orientation);
  const half = Math.acos(Math.min(1, w));
  const sine = Math.sin(half);
  return vec3.scale([x, y, z], sine < 1e-9 ? 2 : (2 * half) / sine);
}

export function createPose(pinned?: Quat): Pose {
  let orientation: Quat = pinned ?? quat.IDENTITY;
  let velocity: Vec3 = [0, 0, 0];
  let holding = pinned !== undefined;
  let idle = 0;

  return {
    get orientation() {
      return orientation;
    },
    get moving() {
      return holding || vec3.length(velocity) > REST || quat.angle(orientation) > REST;
    },
    grab() {
      holding = true;
      velocity = [0, 0, 0];
    },
    drag(dx, dy, dt) {
      const turn: Vec3 = [dy * TURN, dx * TURN, 0];
      orientation = quat.multiply(spin(turn, 1), orientation);
      velocity = vec3.lerp(velocity, vec3.scale(turn, 1 / Math.max(dt, 1 / 240)), Math.min(1, dt * 30));
      idle = 0;
    },
    release() {
      holding = pinned !== undefined;
      idle = 0;
    },
    nudge() {
      velocity = KICK;
      idle = HOLD / 2;
    },
    step(dt) {
      if (holding) return;
      idle += dt;
      const returning = idle > HOLD;
      const pull = returning ? vec3.scale(tilt(orientation), -STIFFNESS) : ([0, 0, 0] as Vec3);
      const drag = vec3.scale(velocity, returning ? DAMPING : FRICTION);
      velocity = vec3.add(velocity, vec3.scale(vec3.sub(pull, drag), dt));
      orientation = quat.multiply(spin(velocity, dt), orientation);
      if (returning && vec3.length(velocity) < REST && quat.angle(orientation) < REST) {
        orientation = quat.IDENTITY;
        velocity = [0, 0, 0];
      }
    },
  };
}
