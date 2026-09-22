# crafter-knot

![The Crafter Station mark, flat and turned into a 3D tube](.github/hero.png)

The Crafter Station mark as a real 3D tube, like three.js's `TorusKnotGeometry`, rendered on WebGPU
with [vgpu](https://vgpu.sh). At rest it is the logo, pixel for pixel. Drag it and it turns into the
woven tube the outline was drawn from.

| Input                     | Does                                                         |
| ------------------------- | ------------------------------------------------------------ |
| Drag, mouse or one finger | Turn it; let go and it drifts, then springs back to the mark |
| `?turn=yaw,pitch`         | Pins a pose in degrees, for stills                           |
| `?still`                  | Skips the intro swing                                        |

```bash
npm install
npm run dev
npm run build && npm run preview
npm run fit   # refits the tube to src/knot/mark.svg (needs Bun)
```

Needs WebGPU: current Chrome, Edge and Safari 26. Without it the page keeps the SVG mark, which is
also what shows while the GPU starts, aligned to the pixel with the first rendered frame.

## From outline to tube

The SVG is one filled outline (42 Bézier segments), not a stroke, so `scripts/fit.ts` recovers the
tube behind it and writes `src/knot/strands.ts`:

1. **Label the outline.** Each segment is a side of one of two strands or one of the four rounded
   ends. The stroke is not constant: about 24.2 units on the lobes, 23.3 on the diagonals and 22.8
   on the bar (in the 257-unit box).
2. **Two strands.** The mark is not a single knot: two strokes merge at the top and bottom centre.
   - The **loop** is closed: top-left lobe, diagonal, under the bar, bottom-right lobe, diagonal,
     under the bar.
   - The **bridge** is open: top-right lobe, the bar, bottom-left lobe. Both of its ends finish
     inside the loop, a weld that reads like the merged strokes from every angle.
3. **Fit.** Each strand is a uniform cubic B-spline in (x, y, z, radius): 40 knots for the loop, 38
   for the bridge. The centre line comes from squared-distance minimisation against the outline
   offset inwards, with a bending penalty that carries it smoothly through the hidden stretches.
   The radius comes from a second least-squares pass, so the tube keeps the mark's changing weight.
   Edge error: 0.12 units rms (0.68 max) on the loop and 0.08 (0.44) on the bridge.
4. **Depth.** The loop dips 1.3 radii where it passes under the bar and rises to the bridge's level
   at the welds, leaving 0.63 radii of clearance at the crossings.
5. **Sweep.** `src/knot/tube.ts` builds rotation-minimising frames (double reflection), spreads the
   closing twist around the loop, and emits 64 sides per ring every 0.012 units, with normals that
   follow the changing radius. `src/knot/occlusion.ts` bakes contact shadows per vertex from the
   other strand's centre line.

## At rest it is the mark

Seen straight on, the tubes already cover the outline except in two places: the four ends at the
gaps (the mark cuts them at a slight tilt with rounded corners), and the chamfered V at the two
welds. So at rest the tubes are inflated by 3 units and trimmed by the mark itself, rasterised from
the SVG into a 2048² mask at load and tested per MSAA sample. Diffed against the SVG at 1024², no
pixel differs beyond anti-aliasing, in Chrome and in Safari 26.

As it turns, the trim and inflation fade out within the first 3°, the gaps under the bar close so
the loop becomes continuous, and the lacquer shading fades in by 29°.

## How it renders

| Pass    | Target                              | Draws                                                                                                                                                                |
| ------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knot    | `lit` (rgba16float, 4x MSAA, depth) | the tubes, shaded per sample: flat `#111` at rest, black lacquer as it turns (Fresnel 0.045, analytic studio softboxes over a white backdrop, baked contact shadows) |
| Present | canvas                              | composited over white in sRGB, soft shoulder above 0.7, dithering                                                                                                    |

```
scripts/fit.ts        mark.svg outline to strands.ts
src/knot/             mark, spline, strands (generated), tube sweep, occlusion, mask
src/render/           renderer, camera, shaders (knot, studio, present)
src/interaction/      pose (inertia, spring back), pointer
src/poster.ts         the SVG shown before the first frame and without WebGPU
```
