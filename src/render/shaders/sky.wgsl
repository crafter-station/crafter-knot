const PI = 3.14159265;
const TAU = 6.28318531;
const FRONT = 0.75;

export fn equirect(direction: vec3f) -> vec2f {
  return vec2f(atan2(direction.x, -direction.z) / TAU + FRONT, acos(clamp(direction.y, -1.0, 1.0)) / PI);
}

export fn unwrap(uv: vec2f) -> vec3f {
  let phi = (uv.x - FRONT) * TAU;
  let theta = uv.y * PI;
  return vec3f(sin(theta) * sin(phi), cos(theta), -sin(theta) * cos(phi));
}

export fn turned(direction: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(c * direction.x + s * direction.z, direction.y, c * direction.z - s * direction.x);
}
