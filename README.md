# crafter-knot

![The Crafter Station mark as glossy black tubes, and as chrome turned in a sunrise field](.github/hero.jpg)

The Crafter Station mark as real 3D tubes, like three.js's `TorusKnotGeometry`, rendered on WebGPU
with [vgpu](https://vgpu.sh). Every stroke keeps the mark's exact path, weight, gaps and joins, and is
swept into a tube you can shape, texture and finish from a drawer, lit by a studio or by the
sunrise panorama from three.js's UltraHDR example, then export as a PNG.

| Input                     | Does                                                         |
| ------------------------- | ------------------------------------------------------------ |
| Drag, mouse or one finger | Turn it; it keeps its pose, with a little drift when flicked |
| Scroll, trackpad pinch    | Zoom (0.4x to 3x)                                            |
| Handle on the right edge  | Opens the look drawer                                        |
| `?turn=yaw,pitch`         | Starts at a pose in degrees, for stills                      |

The drawer holds nine finishes (Lacquer, Chrome, Gold, Porcelain, Rubber, Candy, Pearl, Neon,
Carbon) and every setting behind them:

| Section  | Controls                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Material | tube colour, metal, roughness, clearcoat, iridescence, glow                                                                      |
| Texture  | pattern (rings, stripes, checker, dots) in an accent colour, scale, slant into a spiral                                          |
| Shape    | thickness (0.1x to 2.5x), depth (flattened or tall profiles), round or faceted profile (3 to 8 sides), twist, round or flat ends |
| Scene    | background colour, environment (studio or sunrise), backdrop (the colour or the scene itself), backdrop blur                     |
| Light    | exposure, highlights, fill, rim, turn of the lights or the sky, bloom, vignette                                                  |
| Camera   | zoom, perspective (0 to 70 degrees), turntable spin, face front                                                                  |
| Export   | Save PNG at screen resolution, with the background or transparent                                                                |

The whole state, pose included, is live JSON at the bottom: **Copy JSON** puts it on the
clipboard, and pasting or editing JSON there applies it at once (a red border means it does not
parse yet). The last state is kept in the browser between visits. The default:

```json
{
  "color": "#111111",
  "accent": "#ffffff",
  "background": "#ffffff",
  "metalness": 0,
  "roughness": 0.06,
  "clearcoat": 0,
  "iridescence": 0,
  "glow": 0,
  "bloom": 0,
  "pattern": "none",
  "scale": 6,
  "slant": 0,
  "thickness": 1.8,
  "flatten": 1,
  "facets": 0,
  "twist": 0,
  "ends": "round",
  "environment": "studio",
  "backdrop": "color",
  "blur": 0,
  "exposure": 1,
  "highlights": 1,
  "fill": 1,
  "rim": 1,
  "light": 0,
  "vignette": 0,
  "zoom": 1,
  "perspective": 0,
  "spin": 0,
  "orientation": [0, 0, 0, 1]
}
```

## From outline to tubes

The SVG is one filled outline (42 Bézier segments), not a stroke, so `scripts/fit.ts` recovers the
tubes behind it and writes `src/knot/strands.ts`:

1. **Label the outline.** Each segment is a side of one of two strokes or one of the four rounded
   ends. The weight is not constant: about 24.2 units on the lobes, 23.3 on the diagonals and 22.8
   on the bar (in the 257-unit box).
2. **Two strokes.** The **loop** runs through both lobes and diagonals and is fitted as one closed
   curve, so it stays smooth across the gaps. The **bridge** runs from the top-right lobe along the
   bar to the bottom-left lobe, and both of its ends finish inside the loop where the mark joins
   them.
3. **Fit.** Each stroke is a uniform cubic B-spline in (x, y, z, radius): 40 knots for the loop, 38 for
   the bridge. The centre line comes from squared-distance minimisation against the outline offset
   inwards, with a bending penalty. The radius comes from a second least-squares pass, so the tubes
   keep the mark's changing weight. Edge error: 0.12 units rms (0.68 max) on the loop and 0.08
   (0.44) on the bridge.
4. **Gaps.** The loop is cut where the mark leaves a gap, so it becomes two open pieces whose
   rounded ends land on the mark's own ends. All three tubes lie in one plane; nothing crosses.
   Wider tubes would close the gaps, so `src/knot/gaps.ts` pulls each end back until its gap grows
   with the tube, stopping short of the join behind it. The mark stays open up to about 2.2x.
5. **Sweep.** `src/knot/tube.ts` builds rotation-minimising frames (double reflection) and emits a
   ring every 0.012 units: 64 smooth sides with normals that follow the changing radius, or 3 to 8
   flat-shaded facets, turned by the twist, closed by hemispheres or flat discs. Each vertex also
   carries its centre-line point (so thickness and depth scale around the tube's own axis in the
   vertex shader) and its surface coordinates (length along, turn around) for the patterns.
   `src/knot/occlusion.ts` bakes contact shadows per vertex where tubes meet. Changing the
   thickness, profile, twist or ends rebuilds the mesh in a worker (about 100 ms) while the vertex
   shader stretches the current one, so drags stay smooth; everything else is a uniform.

## The sunrise

`src/assets/spruit-sunrise.hdr.jpg` is the 2048x1024 UltraHDR JPEG from three.js's
`webgl_loader_texture_ultrahdr` example: a normal JPEG plus a gain map that can brighten any pixel
up to 2^16 times. `src/render/ultrahdr.ts` finds both images through the multi-picture index and
reads the `hdrgm` metadata (log2 boost range, gamma, offsets). The first time the sunrise is
chosen, `src/render/sky.ts` does the rest on the GPU:

1. Decode base x 2^gain into rgba16float, with the sun clamped below the half-float limit.
2. Build a mip chain (2x2 box).
3. Prefilter six roughness levels (0 to 1) of GGX reflections by filtered importance sampling, 128
   samples each, reading the mip that matches each sample's footprint.
4. Convolve a 32x16 irradiance map (cosine lobe) for diffuse light.

The knot reads the level for its roughness and the irradiance for its normal; highlights and fill
scale the two. The present pass draws the panorama behind the mark through a 50-degree lens (or the
perspective, when wider), blurred through the same levels.

## How it renders

| Pass    | Target                              | Draws                                                                                                                                                                                                                                                                      |
| ------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sky     | once, when the sunrise is chosen    | gain-map decode, mip chain, six prefiltered roughness levels, irradiance                                                                                                                                                                                                   |
| Knot    | `lit` (rgba16float, 4x MSAA, depth) | the tubes: metal/roughness with a clearcoat layer and thin-film iridescence over analytic studio softboxes (turnable, with highlight, fill and rim levels) or the prefiltered sunrise, patterns in surface coordinates, baked contact shadows, orthographic or perspective |
| Bloom   | 6 levels, 1/2 to 1/64 res           | only when bloom is above 0: soft threshold at 0.75, 13-tap downsample, tent upsample mixed at 0.85                                                                                                                                                                         |
| Present | canvas                              | composited over the background colour or the sunrise in sRGB, bloom added in linear light, vignette, dithering; premultiplied alpha for transparent PNGs                                                                                                                   |

```
scripts/fit.ts        mark.svg outline to strands.ts
src/knot/             mark, spline, strands (generated), tube sweep, gaps, occlusion, worker
src/render/           renderer, camera, bloom, sky, ultrahdr, shaders (knot, studio, sky, bloom, present)
src/assets/           the sunrise UltraHDR panorama
src/interaction/      pose (drift, spin), pointer (drag, zoom)
src/state/            look (finishes, ranges, JSON parsing), store, snapshot, saved
src/ui/               drawer
src/poster.ts         the SVG shown without WebGPU
```

The sunrise panorama is Spruit Sunrise from [Poly Haven](https://polyhaven.com/a/spruit_sunrise)
(CC0), in the UltraHDR conversion shipped with the three.js examples.
