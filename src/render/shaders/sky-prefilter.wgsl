import { equirect, unwrap } from "./sky.wgsl";

const PI = 3.14159265;
const TAU = 6.28318531;
const SAMPLES = 128u;

struct Prefilter {
  roughness: f32,
  texel: f32,
}

@group(0) @binding(0) var radiance: texture_2d<f32>;
@group(0) @binding(1) var skySampler: sampler;
@group(0) @binding(2) var<uniform> prefilter: Prefilter;

fn hammersley(i: u32) -> vec2f {
  return vec2f(f32(i) / f32(SAMPLES), f32(reverseBits(i)) * 2.3283064e-10);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let normal = unwrap(uv);
  let alpha = prefilter.roughness * prefilter.roughness;
  let alpha2 = alpha * alpha;
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(normal.y) > 0.999);
  let tangent = normalize(cross(up, normal));
  let bitangent = cross(normal, tangent);
  var sum = vec3f(0.0);
  var weight = 0.0;
  for (var i = 0u; i < SAMPLES; i++) {
    let xi = hammersley(i);
    let cosine = sqrt((1.0 - xi.y) / (1.0 + (alpha2 - 1.0) * xi.y));
    let sine = sqrt(1.0 - cosine * cosine);
    let phi = TAU * xi.x;
    let bisector = tangent * (cos(phi) * sine) + bitangent * (sin(phi) * sine) + normal * cosine;
    let light = 2.0 * cosine * bisector - normal;
    let facing = dot(normal, light);
    if (facing > 0.0) {
      let lobe = cosine * cosine * (alpha2 - 1.0) + 1.0;
      let pdf = alpha2 / (4.0 * PI * lobe * lobe);
      let lod = max(0.5 * log2(1.0 / (f32(SAMPLES) * pdf * prefilter.texel)) + 1.0, 0.0);
      sum += textureSampleLevel(radiance, skySampler, equirect(light), lod).rgb * facing;
      weight += facing;
    }
  }
  return vec4f(sum / max(weight, 1e-4), 1.0);
}
