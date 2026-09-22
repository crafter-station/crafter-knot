import { unwrap } from "./sky.wgsl";

const PI = 3.14159265;
const TAU = 6.28318531;

struct Irradiance {
  level: f32,
}

@group(0) @binding(0) var radiance: texture_2d<f32>;
@group(0) @binding(1) var<uniform> irradiance: Irradiance;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let normal = unwrap(uv);
  let level = i32(irradiance.level);
  let size = textureDimensions(radiance, level);
  let cell = vec2f(size);
  var sum = vec3f(0.0);
  for (var y = 0u; y < size.y; y++) {
    let v = (f32(y) + 0.5) / cell.y;
    let area = sin(v * PI) * (PI / cell.y) * (TAU / cell.x);
    for (var x = 0u; x < size.x; x++) {
      let direction = unwrap(vec2f((f32(x) + 0.5) / cell.x, v));
      let facing = max(dot(normal, direction), 0.0);
      sum += textureLoad(radiance, vec2u(x, y), level).rgb * facing * area;
    }
  }
  return vec4f(sum / PI, 1.0);
}
