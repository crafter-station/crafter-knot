import { equirect, turned } from "./sky.wgsl";
import { studio } from "./studio.wgsl";

const TAU = 6.2831853;
const DIELECTRIC = 0.045;
const COAT = 0.04;
const SHARP = 0.3;
const SOFT = 6.0;
const DIFFUSE_BLUR = 2.4;
const AMBIENT = 0.22;
const DOT = 0.3;

struct Knot {
  viewProjection: mat4x4f,
  model: mat4x4f,
  eye: vec4f,
  rig: vec4f,
  color: vec3f,
  metalness: f32,
  accent: vec3f,
  roughness: f32,
  backdrop: vec3f,
  clearcoat: f32,
  iridescence: f32,
  glow: f32,
  exposure: f32,
  thickness: f32,
  flatten: f32,
  pattern: f32,
  scale: f32,
  slant: f32,
  circumference: f32,
  sky: f32,
  levels: f32,
}

@group(0) @binding(0) var<uniform> knot: Knot;
@group(0) @binding(1) var specular: texture_2d<f32>;
@group(0) @binding(2) var irradiance: texture_2d<f32>;
@group(0) @binding(3) var skySampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) coords: vec2f,
  @location(3) occlusion: f32,
}

@vertex
fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) core: vec3f,
  @location(3) coords: vec2f,
  @location(4) occlusion: f32,
) -> VertexOut {
  let squash = vec3f(1.0, 1.0, knot.flatten);
  let world = knot.model * vec4f(core + (position - core) * squash * knot.thickness, 1.0);
  var out: VertexOut;
  out.position = knot.viewProjection * world;
  out.world = world.xyz;
  out.normal = (knot.model * vec4f(normalize(normal / squash), 0.0)).xyz;
  out.coords = coords;
  out.occlusion = occlusion;
  return out;
}

fn square(x: f32, width: f32) -> f32 {
  let wave = abs(fract(x - 0.25) - 0.5) * 2.0;
  return smoothstep(0.5 - width, 0.5 + width, wave);
}

fn pattern(coords: vec2f) -> f32 {
  let along = coords.x / (knot.circumference * knot.thickness);
  let count = max(1.0, round(knot.scale));
  let uv = vec2f(along * knot.scale, (coords.y + knot.slant * along) * count);
  let width = fwidth(uv) * 1.5;
  let rings = square(uv.x, width.x);
  let stripes = square(uv.y, width.y);
  let cell = fract(uv) - 0.5;
  let spot = 1.0 - smoothstep(DOT - max(width.x, width.y), DOT + max(width.x, width.y), length(cell));
  let kind = i32(knot.pattern + 0.5);
  if (kind == 1) {
    return rings;
  }
  if (kind == 2) {
    return stripes;
  }
  if (kind == 3) {
    return rings + stripes - 2.0 * rings * stripes;
  }
  if (kind == 4) {
    return spot;
  }
  return 0.0;
}

fn film(facing: f32) -> vec3f {
  let phase = (1.0 - facing) * 3.0 + 0.15;
  return 0.5 + 0.5 * cos(TAU * (phase + vec3f(0.0, 0.33, 0.67)));
}

fn outdoors(map: texture_2d<f32>, direction: vec3f, level: f32) -> vec3f {
  return textureSampleLevel(map, skySampler, equirect(turned(direction, knot.rig.x)), level).rgb;
}

fn environment(direction: vec3f, roughness: f32) -> vec3f {
  if (knot.sky > 0.5) {
    return outdoors(specular, direction, roughness * knot.levels) * knot.rig.y;
  }
  let spread = roughness * roughness;
  return studio(direction, SHARP + spread * SOFT, knot.backdrop, knot.rig) / (1.0 + spread * 4.0);
}

fn ambient(normal: vec3f) -> vec3f {
  if (knot.sky > 0.5) {
    return outdoors(irradiance, normal, 0.0) * knot.rig.z;
  }
  return studio(normal, DIFFUSE_BLUR, knot.backdrop, knot.rig) * 0.8 + AMBIENT * knot.rig.z;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let mark = pattern(in.coords);
  let normal = normalize(in.normal);
  let view = select(normalize(knot.eye.xyz), normalize(knot.eye.xyz - in.world), knot.eye.w > 0.5);
  let facing = clamp(dot(normal, view), 0.0, 1.0);
  let grazing = pow(1.0 - facing, 5.0);
  let reflected = reflect(-view, normal);
  let shadow = mix(0.25, 1.0, in.occlusion);
  let tint = mix(vec3f(1.0), film(facing) * 1.6, knot.iridescence);

  let base = mix(knot.color, knot.accent, mark);
  let f0 = mix(vec3f(DIELECTRIC), base, knot.metalness);
  let fresnel = f0 + (max(vec3f(1.0 - knot.roughness), f0) - f0) * grazing;
  let specular = environment(reflected, knot.roughness) * fresnel * shadow * tint;
  let diffuse = base * (1.0 - knot.metalness) * (1.0 - fresnel) * ambient(normal) * in.occlusion;

  let coat = knot.clearcoat * (COAT + (1.0 - COAT) * grazing);
  let gloss = environment(reflected, 0.0) * coat * shadow * tint;
  let sheen = film(facing) * knot.iridescence * (0.08 + 0.5 * grazing) * shadow;
  let light = (diffuse + specular) * (1.0 - coat) + gloss + sheen + base * knot.glow;
  return vec4f(light * knot.exposure, 1.0);
}
