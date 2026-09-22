struct Panel {
  center: vec3f,
  size: vec2f,
  brightness: f32,
}

fn panel(direction: vec3f, p: Panel, blur: f32) -> f32 {
  let axis = normalize(p.center);
  let facing = dot(direction, axis);
  if (facing <= 1e-4) {
    return 0.0;
  }
  let hit = direction * (length(p.center) / facing) - p.center;
  let reference = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(axis.y) > 0.9);
  let u = normalize(cross(reference, axis));
  let v = cross(axis, u);
  let local = abs(vec2f(dot(hit, u), dot(hit, v)));
  let inside = smoothstep(p.size * 0.5 + blur, p.size * 0.5 - blur, local);
  return inside.x * inside.y * p.brightness;
}

fn turned(direction: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(c * direction.x + s * direction.z, direction.y, c * direction.z - s * direction.x);
}

export fn studio(direction: vec3f, blur: f32, backdrop: vec3f, rig: vec4f) -> vec3f {
  let behind = smoothstep(0.15, -0.35, direction.z);
  let height = direction.y * 0.5 + 0.5;
  let room = mix(vec3f(0.012), vec3f(0.07), height * height) * rig.z;
  let wall = backdrop * 0.92 * rig.w;
  let lit = turned(direction, rig.x);
  let lights = panel(lit, Panel(vec3f(-2.0, 2.6, 6.0), vec2f(5.5, 3.2), 1.3), blur)
    + panel(lit, Panel(vec3f(-3.2, 3.6, 4.2), vec2f(4.2, 2.6), 2.4), blur)
    + panel(lit, Panel(vec3f(5.0, 0.4, 2.6), vec2f(0.9, 6.5), 2.2), blur)
    + panel(lit, Panel(vec3f(-5.0, -1.6, 1.8), vec2f(0.7, 4.0), 0.9), blur);
  return mix(room, wall, behind) + vec3f(lights * rig.y);
}
