import { linearToSrgb3 } from "@vgpu/wgsl-std/color";

const KNEE = 0.7;

struct Present {
  background: vec3f,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var<uniform> present: Present;

fn shoulder(color: vec3f) -> vec3f {
  let over = max(color - KNEE, vec3f(0.0));
  return min(color, vec3f(KNEE)) + (1.0 - KNEE) * (1.0 - exp(-over / (1.0 - KNEE)));
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let texel = textureLoad(scene, vec2i(position.xy), 0);
  let knot = linearToSrgb3(shoulder(texel.rgb / max(texel.a, 1e-5)));
  let color = mix(linearToSrgb3(present.background), knot, texel.a);
  let noise = fract(sin(dot(position.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  return vec4f(color + noise / 255.0, 1.0);
}
