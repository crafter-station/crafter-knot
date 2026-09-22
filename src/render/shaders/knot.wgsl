import { studio } from "./studio.wgsl";

const INK = vec3f(0.00561);
const F0 = 0.045;
const BLUR = 0.35;
const KEY = vec3f(-0.52, 0.62, 0.59);
const INFLATE = 0.024;

struct Knot {
  viewProjection: mat4x4f,
  model: mat4x4f,
  gaps: array<vec4f, 2>,
  look: vec4f,
}

@group(0) @binding(0) var<uniform> knot: Knot;
@group(0) @binding(1) var mask: texture_2d<f32>;
@group(0) @binding(2) var maskSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) track: vec3f,
  @location(2) @interpolate(perspective, sample) mark: vec2f,
}

@vertex
fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) track: vec3f) -> VertexOut {
  let inflated = position + normal * INFLATE * knot.look.y;
  let clip = knot.viewProjection * knot.model * vec4f(inflated, 1.0);
  var out: VertexOut;
  out.position = clip;
  out.normal = (knot.model * vec4f(normal, 0.0)).xyz;
  out.track = track;
  out.mark = inflated.xy / knot.look.z * vec2f(0.5, -0.5) + 0.5;
  return out;
}

fn trimmed(track: vec3f) -> bool {
  if (knot.look.y > 0.0) {
    return true;
  }
  if (track.x > 0.5) {
    return false;
  }
  for (var g = 0; g < 2; g++) {
    let gap = knot.gaps[g];
    let u = select(track.y, track.y + gap.z, track.y < gap.x);
    if (u > gap.x && u < gap.y) {
      return true;
    }
  }
  return false;
}

fn lacquer(normal: vec3f, occlusion: f32) -> vec3f {
  let view = vec3f(0.0, 0.0, 1.0);
  let facing = clamp(dot(normal, view), 0.0, 1.0);
  let fresnel = F0 + (1.0 - F0) * pow(1.0 - facing, 5.0);
  let reflected = reflect(-view, normal);
  let specular = studio(reflected, BLUR) * fresnel * mix(0.25, 1.0, occlusion);
  let diffuse = INK * (0.55 + 1.1 * max(dot(normal, normalize(KEY)), 0.0)) * occlusion;
  return diffuse + specular;
}

@fragment
fn fs_main(in: VertexOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  if (trimmed(in.track) && textureSampleLevel(mask, maskSampler, in.mark, 0.0).r < 0.5) {
    discard;
  }
  let reveal = knot.look.x;
  let lit = select(INK * 0.4, lacquer(normalize(in.normal), in.track.z), front);
  return vec4f(mix(INK, lit, reveal), 1.0);
}
