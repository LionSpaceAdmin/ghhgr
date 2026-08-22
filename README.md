# Lions of Zion GPU Particle Lion

A lion-only visual proof of concept built as a real-time GPU particle system with Next.js, React, Three.js, WebGL and custom GLSL shaders.

The uploaded lion artwork is used only as an offline structural reference. It is **not rendered, textured, embedded as an image, or shipped as a visible runtime asset**.

## Runtime stack

- Next.js 16
- React 19
- TypeScript 5.9
- Three.js r180
- WebGL / WebGL2
- Custom GLSL vertex and fragment shaders
- Typed arrays and `THREE.BufferGeometry`
- One deterministic `requestAnimationFrame` master loop

## Particle structure

The committed `LIONA03` payload contains:

- 3,325 structural anchors derived from the reference artwork
- color, energy, region, formation order and shallow depth per anchor
- 1,800 structural fiber links
- compact int16 / uint16 encoding

At runtime every anchor expands deterministically into seven GPU particles, producing **23,275 particles** without shipping the source image.

The renderer uploads the attributes once and changes only global shader uniforms each frame. Particle positions, formation, subtle living motion, parallax and wind are calculated on the GPU.

## Animation

The page uses one timeline in one `requestAnimationFrame` loop:

1. scattered state
2. progressive structural formation
3. stable lion
4. subtle living motion and pointer parallax
5. a restrained synchronized wind pulse

There are no GSAP, Framer Motion, SVG animation or image-texture shortcuts.

## Performance behavior

The renderer monitors average frame duration. Under sustained load it degrades secondary detail first:

1. reduce device pixel ratio and remove structural line segments
2. reduce secondary point density
3. reduce density further while preserving the primary lion structure

Desktop and mobile use separate scale rules. `prefers-reduced-motion` starts directly in the stable state and disables procedural movement.

## Accessibility and controls

The WebGL canvas is visual-only and has an accessible semantic label.

- `Space`: pause / resume timeline
- `R`: replay formation
- hidden browser tabs stop timeline progression
- WebGL initialization failure receives a non-canvas fallback state

## Regenerating the structural dataset

The project includes a Sharp-based offline preprocessing script:

```bash
npm install
npm run generate:particles -- /absolute/path/to/reference.png
npm run dev
```

The generator:

1. reads and resamples the reference with Sharp
2. measures luminance, local contrast and edge energy
3. uses deterministic thresholding to select structural samples
4. classifies regions and calculates 2.5D depth
5. derives structural fiber links
6. packs the result into the compact `LIONA03` binary layout
7. writes the encoded structural payload into `src/data/`

The reference image itself is never copied into `public/` or used by the browser renderer.

## Production

```bash
npm run build
npm start
```
