struct Panel {
  center: vec3f,
  size: vec2f,
  brightness: f32,
}

fn panel(direction: vec3f, p: Panel, blur: f32) -> f32 {
  let normal = -normalize(p.center);
  let facing = dot(direction, normal);
  if (facing <= 1e-4) {
    return 0.0;
  }
  let hit = direction * (dot(p.center, normal) / facing) - p.center;
  let reference = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(normal.y) > 0.9);
  let u = normalize(cross(reference, normal));
  let v = cross(normal, u);
  let local = abs(vec2f(dot(hit, u), dot(hit, v)));
  let inside = smoothstep(p.size * 0.5 + blur, p.size * 0.5 - blur, local);
  return inside.x * inside.y * p.brightness;
}

export fn studio(direction: vec3f, blur: f32) -> vec3f {
  let behind = smoothstep(0.15, -0.35, direction.z);
  let floor = smoothstep(-0.2, -0.7, direction.y) * 0.06;
  let room = mix(0.018 + floor, 0.92, behind);
  let lights = panel(direction, Panel(vec3f(-3.2, 3.6, 4.2), vec2f(4.2, 2.6), 3.2), blur)
    + panel(direction, Panel(vec3f(5.0, 0.4, 2.6), vec2f(0.9, 6.5), 2.2), blur)
    + panel(direction, Panel(vec3f(-5.0, -1.6, 1.8), vec2f(0.7, 4.0), 0.9), blur)
    + panel(direction, Panel(vec3f(0.0, 6.0, 0.8), vec2f(9.0, 0.8), 1.4), blur);
  return vec3f(room + lights);
}
