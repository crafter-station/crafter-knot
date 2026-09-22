import { studio } from "./studio.wgsl";

const INK = vec3f(0.00561);
const F0 = 0.045;
const BLUR = 0.35;
const KEY = vec3f(-0.52, 0.62, 0.59);

struct Knot {
  viewProjection: mat4x4f,
  model: mat4x4f,
}

@group(0) @binding(0) var<uniform> knot: Knot;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) occlusion: f32,
}

@vertex
fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) occlusion: f32) -> VertexOut {
  var out: VertexOut;
  out.position = knot.viewProjection * knot.model * vec4f(position, 1.0);
  out.normal = (knot.model * vec4f(normal, 0.0)).xyz;
  out.occlusion = occlusion;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let normal = normalize(in.normal);
  let view = vec3f(0.0, 0.0, 1.0);
  let facing = clamp(dot(normal, view), 0.0, 1.0);
  let fresnel = F0 + (1.0 - F0) * pow(1.0 - facing, 5.0);
  let specular = studio(reflect(-view, normal), BLUR) * fresnel * mix(0.25, 1.0, in.occlusion);
  let diffuse = INK * (0.55 + 1.1 * max(dot(normal, normalize(KEY)), 0.0)) * in.occlusion;
  return vec4f(diffuse + specular, 1.0);
}
