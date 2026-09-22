@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var skySampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(source, skySampler, uv, 0.0).rgb, 1.0);
}
