struct Down {
  texel: vec2f,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> down: Down;

fn tap(uv: vec2f, x: f32, y: f32) -> vec3f {
  return textureSampleLevel(src, srcSampler, uv + vec2f(x, y) * down.texel, 0.0).rgb;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = tap(uv, -2.0, -2.0);
  let b = tap(uv, 0.0, -2.0);
  let c = tap(uv, 2.0, -2.0);
  let d = tap(uv, -2.0, 0.0);
  let e = tap(uv, 0.0, 0.0);
  let f = tap(uv, 2.0, 0.0);
  let g = tap(uv, -2.0, 2.0);
  let h = tap(uv, 0.0, 2.0);
  let i = tap(uv, 2.0, 2.0);
  let j = tap(uv, -1.0, -1.0);
  let k = tap(uv, 1.0, -1.0);
  let l = tap(uv, -1.0, 1.0);
  let m = tap(uv, 1.0, 1.0);
  let color = e * 0.125
    + (a + c + g + i) * 0.03125
    + (b + d + f + h) * 0.0625
    + (j + k + l + m) * 0.125;
  return vec4f(color, 1.0);
}
