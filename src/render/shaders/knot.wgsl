import { studio } from "./studio.wgsl";

const DIELECTRIC = 0.045;
const COAT = 0.04;
const SHARP = 0.3;
const SOFT = 6.0;
const DIFFUSE_BLUR = 2.4;
const AMBIENT = 0.22;

struct Knot {
  viewProjection: mat4x4f,
  model: mat4x4f,
  color: vec3f,
  metalness: f32,
  backdrop: vec3f,
  roughness: f32,
  clearcoat: f32,
  exposure: f32,
  light: f32,
  thickness: f32,
}

@group(0) @binding(0) var<uniform> knot: Knot;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) occlusion: f32,
}

@vertex
fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) core: vec3f,
  @location(3) occlusion: f32,
) -> VertexOut {
  var out: VertexOut;
  out.position = knot.viewProjection * knot.model * vec4f(core + (position - core) * knot.thickness, 1.0);
  out.normal = (knot.model * vec4f(normal, 0.0)).xyz;
  out.occlusion = occlusion;
  return out;
}

fn environment(direction: vec3f, roughness: f32) -> vec3f {
  let spread = roughness * roughness;
  return studio(direction, SHARP + spread * SOFT, knot.backdrop, knot.light) / (1.0 + spread * 4.0);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let normal = normalize(in.normal);
  let view = vec3f(0.0, 0.0, 1.0);
  let grazing = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 5.0);
  let reflected = reflect(-view, normal);
  let shadow = mix(0.25, 1.0, in.occlusion);

  let f0 = mix(vec3f(DIELECTRIC), knot.color, knot.metalness);
  let fresnel = f0 + (max(vec3f(1.0 - knot.roughness), f0) - f0) * grazing;
  let specular = environment(reflected, knot.roughness) * fresnel * shadow;
  let irradiance = studio(normal, DIFFUSE_BLUR, knot.backdrop, knot.light) * 0.8 + AMBIENT;
  let diffuse = knot.color * (1.0 - knot.metalness) * (1.0 - fresnel) * irradiance * in.occlusion;

  let coat = knot.clearcoat * (COAT + (1.0 - COAT) * grazing);
  let gloss = environment(reflected, 0.0) * coat * shadow;
  return vec4f(((diffuse + specular) * (1.0 - coat) + gloss) * knot.exposure, 1.0);
}
