# PRD: Runtime Entrypoints and Build-Time Compilation Direction

## Problem

`shdr` currently mixes two distinct concerns behind one public API surface:

1. **Authoring / compiler DSL**
   - expression AST construction
   - `fn(...)`
   - GLSL type tokens
   - builtins
   - `compileFragment(...)`
   - `.shdr.ts` transform support

2. **Browser rendering runtime**
   - WebGL context creation
   - shader compile/link
   - render loop
   - resize/mouse uniforms
   - custom uniform uploads
   - texture loading

This is convenient during early development, but it obscures an important advantage of the architecture: most shader authoring/compilation work can eventually happen at build/server time, leaving a much smaller runtime cost on the client.

The project should make that split explicit and guide users toward an architecture where the compiler and renderer are separable.

---

## Goal

Move toward React-style split entrypoints:

```ts
import { fn, Float, Vec2, compileFragment } from "shdr";
import { createShader } from "shdr/webgl";
```

Future WebGPU support should use a parallel backend-specific entry:

```ts
import { createShader } from "shdr/webgpu";
```

The long-term story should be:

> Author shaders with the TypeScript DSL at build time. Ship compiled GLSL/WGSL plus a small backend-specific runtime to the browser.

---

## Preferred Entrypoints

### `shdr`

Compiler / authoring API:

```ts
export {
  compileFragment,
  compileFn,
  defineUniforms,
  fn,
  Float,
  Vec2,
  Vec3,
  Vec4,
  Mat2,
  // builtins...
} from "shdr";
```

This entry may include compiler/AST code because it is primarily for authoring, build-time compilation, and server-side usage.

### `shdr/webgl`

WebGL2 browser runtime:

```ts
export { createShader } from "shdr/webgl";
export type { ShaderOptions, ShaderInstance } from "shdr/webgl";
```

This entry should avoid exporting compiler internals unless absolutely necessary.

### `shdr/webgpu` — future

Future WebGPU runtime:

```ts
export { createShader } from "shdr/webgpu";
```

or, if naming needs to distinguish backend explicitly:

```ts
export { createWebGpuShader } from "shdr/webgpu";
```

The package-level public entrypoint should not force WebGL and WebGPU runtimes into the same client bundle.

### `shdr/vite` — future/package boundary

Vite plugin entry:

```ts
import { shdrPlugin } from "shdr/vite";
```

This should remain build-tool-specific and should not be part of the browser runtime bundle.

---

## Current Repo Direction

The current local repo can move incrementally toward this shape without full package exports yet.

Possible file layout:

```txt
src/shdr/index.ts          # compiler / DSL authoring API
src/shdr/runtime.ts        # current WebGL implementation internals
src/shdr/webgl.ts          # public WebGL runtime re-export
src/vite-plugin-shdr.ts    # local Vite plugin entry for now
```

`src/shdr/webgl.ts` would simply re-export:

```ts
export { createShader } from "./runtime.ts";
export type { ShaderOptions, ShaderInstance } from "./runtime.ts";
```

Then sketches can import only the WebGL runtime from the backend entry:

```ts
import { createShader } from "../../shdr/webgl.ts";
import { fragment, uniforms } from "./fragment.shdr.ts";
```

`fragment.shdr.ts` remains the authoring/compiler boundary and can import `compileFragment`, `defineUniforms`, `fn`, builtins, and type helpers from `../../shdr/index.ts`.

This makes the split visible without requiring packaging work immediately.

---

## Long-Term Build-Time Compilation Direction

After the schema-first uniforms work, local sketch modules already follow an interim split:

```ts
// fragment.shdr.ts — authoring/compiler boundary
export const uniforms = defineUniforms((u) => ({
  pixelation: u.float(40),
}));

const _fragment: FragmentFn<typeof uniforms> = ({ $ }) => {
  // shader DSL here
};

export const fragment = compileFragment(_fragment, { uniforms });

// index.ts — DOM/runtime boundary
import { fragment, uniforms } from "./fragment.shdr.ts";
import { createShader } from "shdr/webgl";

createShader({ canvas, fragment, uniforms });
```

This still ships compiler code today because `fragment.shdr.ts` runs in the browser bundle, but it clarifies the module boundary: shader authoring and compilation live in `.shdr.ts`; DOM/runtime setup lives in normal `.ts`.

Long-term, `.shdr.ts` modules could compile to shader artifacts during the Vite transform/build:

```ts
import shader from "./fragment.shdr.ts";
import { createShader } from "shdr/webgl";

createShader({ canvas, shader });
```

where `shader` is something like:

```ts
type CompiledShaderModule<U extends UniformSchema = UniformSchema> = {
  glsl: string;
  uniformSchema: U;
  inspectViews?: string[];
};
```

This would allow the browser bundle to include:

- compiled GLSL string
- serializable uniform schema
- small WebGL renderer

and avoid shipping:

- AST compiler
- expression builders used only during compilation
- transform-only authoring helpers

---

## Why Backend-Specific Entrypoints

Prefer:

```ts
shdr / webgl;
shdr / webgpu;
```

over a generic:

```ts
shdr / runtime;
```

because backend-specific entries:

- make the chosen rendering backend explicit
- avoid accidentally bundling both WebGL and WebGPU runtimes
- allow WebGL and WebGPU APIs to diverge if needed
- scale naturally as additional targets are added

A generic runtime facade could still be added later, but it should not be the primary low-level import if bundle size matters.

---

## Non-Goals for Initial Entrypoint Split

- Do not implement WebGPU yet.
- Do not implement full build-time `.shdr.ts` compilation yet.
- Do not remove runtime compilation yet.
- Do not break existing imports immediately unless doing a coordinated cleanup.
- Do not design final package `exports` until the local API shape stabilizes.

---

## Suggested Implementation Phases

### Phase 1 — Local entrypoint split

Add:

```txt
src/shdr/webgl.ts
```

Update sketches to import the runtime from the backend-specific entry:

```ts
import { createShader } from "../../shdr/webgl.ts";
import { fragment, uniforms } from "./fragment.shdr.ts";
```

Keep shader authoring/compiler imports inside `.shdr.ts` modules.

Keep `createShader` exported from `src/shdr/index.ts` temporarily for backward compatibility.

### Phase 2 — Documentation

Update README to describe:

```ts
shdr; // authoring/compiler API
shdr / webgl; // WebGL runtime
shdr / webgpu; // future WebGPU runtime
shdr / vite; // Vite transform/plugin
```

Emphasize that the architecture is designed so compilation can eventually move out of the client bundle.

### Phase 3 — Runtime accepts compiled shader artifacts

Add support for:

```ts
createShader({ canvas, shader });
```

where `shader` contains precompiled GLSL and metadata.

Keep current support:

```ts
createShader({ canvas, fragment });
```

for development and backwards compatibility.

### Phase 4 — Vite build-time shader artifacts

Teach the `.shdr.ts` Vite transform to optionally emit compiled shader modules/artifacts.

Possible future import forms:

```ts
import shader from "./fragment.shdr.ts";
import glsl from "./fragment.shdr.ts?glsl";
```

This phase is where client bundle size can be meaningfully reduced.

### Phase 5 — Future WebGPU entry

Add:

```ts
shdr / webgpu;
```

once WGSL/WebGPU backend work begins.

---

## Open Questions

- Should `shdr` continue exporting `createShader` long-term, or should runtime imports eventually require `shdr/webgl`?
- What should the compiled shader artifact shape be?
- Should compiled shader artifacts use `uniformSchema`, `uniforms`, or another field name for schema metadata?
- Should `.shdr.ts` default exports eventually become compiled shader modules?
- Should dev mode keep runtime compilation for easier debugging while production uses precompiled artifacts?
