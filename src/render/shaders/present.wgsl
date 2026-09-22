import { linearToSrgb3, srgbToLinear3 } from "@vgpu/wgsl-std/color";
import { equirect, turned } from "./sky.wgsl";

const KNEE = 0.7;

struct Present {
  background: vec3f,
  vignette: f32,
  lens: vec2f,
  transparent: f32,
  bloom: f32,
  scenery: f32,
  blur: f32,
  turn: f32,
  exposure: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var halo: texture_2d<f32>;
@group(0) @binding(2) var haloSampler: sampler;
@group(0) @binding(3) var<uniform> present: Present;
@group(0) @binding(4) var sky: texture_2d<f32>;
@group(0) @binding(5) var skySampler: sampler;

fn shoulder(color: vec3f) -> vec3f {
  let over = max(color - KNEE, vec3f(0.0));
  return min(color, vec3f(KNEE)) + (1.0 - KNEE) * (1.0 - exp(-over / (1.0 - KNEE)));
}

fn backdrop(position: vec2f, size: vec2f) -> vec3f {
  if (present.scenery < 0.5) {
    return linearToSrgb3(present.background);
  }
  let ndc = vec2f(position.x / size.x * 2.0 - 1.0, 1.0 - position.y / size.y * 2.0);
  let ray = normalize(vec3f(ndc * present.lens, -1.0));
  let light = textureSampleLevel(sky, skySampler, equirect(turned(ray, present.turn)), present.blur).rgb;
  return linearToSrgb3(shoulder(light * present.exposure));
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(scene));
  let texel = textureLoad(scene, vec2i(position.xy), 0);
  let knot = linearToSrgb3(shoulder(texel.rgb / max(texel.a, 1e-5)));
  let centred = (position.xy - size * 0.5) / min(size.x, size.y);
  let shade = 1.0 - present.vignette * smoothstep(0.2, 0.95, length(centred));
  let glow = min(textureSampleLevel(halo, haloSampler, position.xy / size, 0.0).rgb * present.bloom, vec3f(1.0));
  if (present.transparent > 0.5) {
    let spill = max(glow.r, max(glow.g, glow.b)) * (1.0 - texel.a);
    return vec4f(knot * texel.a + linearToSrgb3(glow) * (1.0 - texel.a), texel.a + spill);
  }
  let base = mix(backdrop(position.xy, size), knot, texel.a);
  let color = linearToSrgb3(min(srgbToLinear3(base) + glow, vec3f(1.0))) * shade;
  let noise = fract(sin(dot(position.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  return vec4f(color + noise / 255.0, 1.0);
}
