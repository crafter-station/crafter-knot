import { turned } from "./sky.wgsl";

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

fn dome(direction: vec3f) -> vec3f {
  let y = direction.y;
  let top = vec3f(0.30, 0.32, 0.36);
  let horizon = vec3f(0.05, 0.05, 0.06);
  let a = abs(y);
  return select(mix(horizon, vec3f(0.0), pow(a, 0.5)), mix(horizon, top, pow(a, 0.7)), y > 0.0);
}

fn darkPanels(direction: vec3f, blur: f32) -> f32 {
  return panel(direction, Panel(vec3f(3.5, -4.0, -5.0), vec2f(6.0, 4.0), 1.6), blur)
    + panel(direction, Panel(vec3f(-5.0, 0.0, 3.0), vec2f(1.0, 7.0), 2.5), blur)
    + panel(direction, Panel(vec3f(0.0, -6.0, 0.0), vec2f(8.0, 1.0), 1.4), blur);
}

fn lightPanels(direction: vec3f, blur: f32) -> f32 {
  return panel(direction, Panel(vec3f(0.0, -4.0, -5.0), vec2f(6.0, 3.0), 2.5), blur)
    + panel(direction, Panel(vec3f(4.0, 1.0, -2.0), vec2f(6.0, 2.0), 2.0), blur)
    + panel(direction, Panel(vec3f(-4.0, 1.0, -2.0), vec2f(6.0, 2.0), 2.0), blur);
}

export fn studio(direction: vec3f, blur: f32, backdrop: vec3f, rig: vec4f, light: f32) -> vec3f {
  let lit = turned(direction, rig.x);
  let height = direction.y * 0.5 + 0.5;
  let cyclorama = backdrop * mix(0.25, 0.6, height);
  let room = mix(dome(direction), cyclorama, light) * rig.z;
  let behind = smoothstep(0.15, -0.35, direction.z);
  let wall = backdrop * behind * light * rig.w;
  let panels = mix(darkPanels(lit, blur), lightPanels(lit, blur), light) * rig.y;
  return room + wall + vec3f(panels);
}
