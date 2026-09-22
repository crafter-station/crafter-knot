import { srgbToLinear3 } from "@vgpu/wgsl-std/color";

const LIMIT = 60000.0;

struct Decode {
  low: f32,
  high: f32,
  gamma: f32,
  offsetSdr: f32,
  offsetHdr: f32,
}

@group(0) @binding(0) var base: texture_2d<f32>;
@group(0) @binding(1) var gain: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var<uniform> decode: Decode;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sdr = srgbToLinear3(textureSampleLevel(base, imageSampler, uv, 0.0).rgb);
  let recovery = pow(textureSampleLevel(gain, imageSampler, uv, 0.0).rgb, vec3f(1.0 / decode.gamma));
  let boost = exp2(mix(vec3f(decode.low), vec3f(decode.high), recovery));
  return vec4f(min((sdr + decode.offsetSdr) * boost - decode.offsetHdr, vec3f(LIMIT)), 1.0);
}
