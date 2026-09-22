import { luminance } from "@vgpu/wgsl-std/color";

struct Extract {
  threshold: f32,
  smoothing: f32,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> extract: Extract;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = max(textureSampleLevel(src, srcSampler, uv, 0.0).rgb, vec3f(0.0));
  let weight = smoothstep(extract.threshold, extract.threshold + extract.smoothing, luminance(color));
  return vec4f(color * weight, 1.0);
}
