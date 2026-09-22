struct Up {
  texel: vec2f,
  radius: f32,
}

@group(0) @binding(0) var coarse: texture_2d<f32>;
@group(0) @binding(1) var fine: texture_2d<f32>;
@group(0) @binding(2) var bloomSampler: sampler;
@group(0) @binding(3) var<uniform> up: Up;

fn tap(uv: vec2f, x: f32, y: f32) -> vec3f {
  return textureSampleLevel(coarse, bloomSampler, uv + vec2f(x, y) * up.texel, 0.0).rgb;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let tent = (
    tap(uv, -1.0, -1.0) + tap(uv, 1.0, -1.0) + tap(uv, -1.0, 1.0) + tap(uv, 1.0, 1.0)
    + (tap(uv, 0.0, -1.0) + tap(uv, -1.0, 0.0) + tap(uv, 1.0, 0.0) + tap(uv, 0.0, 1.0)) * 2.0
    + tap(uv, 0.0, 0.0) * 4.0
  ) / 16.0;
  let base = textureSampleLevel(fine, bloomSampler, uv, 0.0).rgb;
  return vec4f(mix(base, tent, up.radius), 1.0);
}
