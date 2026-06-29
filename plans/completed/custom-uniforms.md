# Custom Uniforms Plan

## Goal

Add first-class custom uniforms to `shdr` with a clean runtime API and efficient updates.

Initial preferred API:

```ts
import { createShader, uniform } from "./shdr";

const pixelation = uniform.float(12);

createShader({
  canvas,
  fragment,
  uniforms: {
    pixelation,
  },
});

pixelation.set(24);
```

Inside a fragment:

```ts
export const fragment: FragmentFn = ({ $, floor, vec2, texture }) => {
  const pixelation = $.u.pixelation;
  // compiles to u_pixelation
};
```

For now, do **not** support external signal adapters. `shdr` should own the uniform primitive and expose `.set(...)` for dynamic updates.

---

## Design Principles

- Custom uniforms should be explicitly declared in `createShader` options.
- The compiler should emit GLSL uniform declarations from the provided schema.
- Runtime uniform updates should be dirty-tracked.
- Built-in uniforms remain special-cased for now:
  - `u_time`
  - `u_resolution`
  - `u_mouse`
- Static and dynamic uniforms should share one API where possible.
- Dynamic uniforms should not require recompiling the shader.
- Texture loading may be async, but should be hidden behind `uniform.texture2D(...)`.

---

## Phase 1 — Scalar and Vector Dynamic Uniforms

Support:

```ts
uniform.float(12);
uniform.vec2([1, 2]);
uniform.vec3([1, 2, 3]);
uniform.vec4([1, 2, 3, 4]);
```

Runtime mutation:

```ts
const pixelation = uniform.float(12);
pixelation.set(24);
```

### Public API

Add exports from `src/shdr/index.ts`:

```ts
export { uniform } from "./uniform.ts";
```

Create `src/shdr/uniform.ts` with something conceptually like:

```ts
type UniformKind = "float" | "vec2" | "vec3" | "vec4";

type UniformValue =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number];

type Uniform<T> = {
  readonly kind: UniformKind;
  get(): T;
  set(value: T): void;
  consumeDirty(): boolean;
};
```

Possible user-facing constructors:

```ts
uniform.float(value: number)
uniform.vec2(value: [number, number])
uniform.vec3(value: [number, number, number])
uniform.vec4(value: [number, number, number, number])
```

### Compiler Changes

`compileFragment` currently only receives a fragment function. It should receive optional uniform definitions too.

Possible shape:

```ts
compileFragment(fragment, { uniforms });
```

`createShader` passes its `uniforms` option through when compiling a DSL fragment.

Emitted GLSL:

```glsl
uniform float u_pixelation;
uniform vec2 u_offset;
uniform vec3 u_tint;
uniform vec4 u_bounds;
```

Naming rule:

- User key `pixelation` becomes GLSL uniform `u_pixelation`.
- Prevent collisions with reserved built-ins:
  - `time`
  - `resolution`
  - `mouse`
  - maybe also names already starting with `u_` unless intentionally supported.

### DSL Context Changes

Add a custom uniform accessor:

```ts
$.u.pixelation;
```

This is intentionally terse and close to GLSL naming conventions: `$.u.pixelation` compiles to `u_pixelation`.

Initially this may be loosely typed as:

```ts
readonly u: Record<string, ExprProxy<GlslType>>;
```

Longer-term, `FragmentFn` can become generic over a uniform schema for stronger typing.

Potential near-term compromise:

```ts
$.uniform("pixelation", "float");
```

However, `$.u.pixelation` is the preferred long-term DX.

### Runtime Changes

Extend `ShaderOptions`:

```ts
interface ShaderOptions {
  canvas: HTMLCanvasElement;
  fragment: string | FragmentFn;
  uniforms?: Record<string, Uniform<any>>;
}
```

On setup:

- create/link program
- get locations for all custom uniforms
- upload initial values once

On render:

- only call `gl.uniform*` when `uniform.consumeDirty()` returns true
- this avoids unnecessary uniform uploads every frame

Pseudo-code:

```ts
for (const runtimeUniform of customUniforms) {
  if (runtimeUniform.uniform.consumeDirty()) {
    runtimeUniform.apply();
  }
}
```

Important detail: initial uniforms should start dirty so first render uploads them.

---

## Phase 2 — Strongly Typed Uniform Context

Improve TypeScript inference so this works:

```ts
const uniforms = {
  pixelation: uniform.float(12),
  offset: uniform.vec2([0, 0]),
};

const fragment: FragmentFn<typeof uniforms> = ({ $ }) => {
  $.u.pixelation; // ExprProxy<"float">
  $.u.offset; // ExprProxy<"vec2">
};
```

This likely requires:

- making `FragmentFn` generic
- deriving GLSL expression types from uniform definitions
- threading the generic through `createShader`

Sketch:

```ts
type UniformExprs<U extends UniformMap> = {
  [K in keyof U]: U[K] extends Uniform<infer Kind, any>
    ? ExprProxy<Kind>
    : never;
};

type ShaderContext<U extends UniformMap = {}> = {
  u: UniformExprs<U>;
  // existing fields...
};
```

This phase is mostly DX/type-safety. Runtime behavior can remain the same as Phase 1.

---

## Phase 3 — Texture Uniforms

Support image textures:

```ts
const image = uniform.texture2D("/image.jpg");

createShader({
  canvas,
  fragment,
  uniforms: {
    texture: image,
    pixelation: uniform.float(12),
  },
});
```

Generated GLSL for key `texture`:

```glsl
uniform sampler2D u_texture;
uniform vec2 u_texture_resolution;
```

DSL usage:

```ts
$.u.texture;
$.u.textureResolution;
```

or, preferably later:

```ts
$.u.texture.sample(uv);
$.u.texture.resolution;
```

### Required Compiler/Builtin Changes

Add texture/sampler type support to the type system:

```ts
type GlslType = "float" | "vec2" | "vec3" | "vec4" | "mat2" | "sampler2D";
```

Add texture sampling builtin for GLSL ES 3.00:

```ts
texture(sampler, uv); // emits texture(u_texture, uv), returns vec4
```

Note: in GLSL ES 3.00, use `texture(...)`, not `texture2D(...)`.

### Runtime Changes

`uniform.texture2D(url)` should:

- create a WebGL texture
- load image async
- upload placeholder pixel immediately if desired
- upload real image when loaded
- set texture parameters
- assign a texture unit
- upload sampler uniform with `gl.uniform1i(location, unit)`
- expose texture resolution via `u_texture_resolution`

Texture resolution is static for image URLs, but should be updated when the image loads.

---

## Phase 4 — Texture Mutation / Dynamic Resources

Allow replacing textures at runtime:

```ts
const image = uniform.texture2D("/a.jpg");
image.set("/b.jpg");
```

This should:

- mark texture dirty/loading
- keep old texture or placeholder active while loading
- upload new image when ready
- update corresponding resolution uniform

Potential future variants:

```ts
uniform.texture2D(imageElement);
uniform.texture2D(videoElement);
uniform.texture2D(canvasElement);
```

Video/canvas textures are dynamic and may need per-frame uploads, so they should be separate from static image textures.

---

## Phase 5 — Local Texture Upload MVP

Allow texture uniforms to accept local uploaded image files.

### API

Extend texture uniform values from only URL strings:

```ts
uniform.texture2D("/image.jpg");
texture.set("/other.jpg");
```

to also support `File` / `Blob`:

```ts
const texture = uniform.texture2D("/default.jpg");
texture.set(file);
```

Suggested type:

```ts
type TextureSource = string | File | Blob;
```

Then:

```ts
UniformValue<"texture2D"> = TextureSource;
```

### Runtime Requirements

When the source is a string:

- load it as a normal URL

When the source is a `File` or `Blob`:

- create an object URL with `URL.createObjectURL(source)`
- load that URL into an `Image`
- upload the image to the WebGL texture on load
- update `u_texture_resolution`
- revoke the object URL after load/error

Important details:

- keep the old texture active while the new local image loads
- ignore stale async loads if a newer source is set before the previous load finishes
- compare strings by value
- compare `File` / `Blob` values by object identity

### lil-gui Upload Button Helper

`lil-gui` does not have a native file picker control, but a button can trigger a hidden file input.

Possible helper:

```ts
addTextureUploadControl(gui, "Upload texture", uniforms.texture);
```

Conceptual implementation:

```ts
const input = document.createElement("input");
input.type = "file";
input.accept = "image/png,image/jpeg,image/webp,image/gif";
input.style.display = "none";

document.body.appendChild(input);

input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (!file) return;

  textureUniform.set(file);
  input.value = "";
});

const params = {
  uploadTexture() {
    input.click();
  },
};

gui.add(params, "uploadTexture").name("Upload texture");
```

Cleanup should remove the hidden input if the control helper returns a disposer or if/when a more formal controls lifecycle is added.

---

## Phase 6 — Optional Ergonomics

Partially implemented: `createShader(...)` now returns the original custom uniform map on `shader.uniforms`.

Remaining possible later improvements:

### Uniform Group Helpers

```ts
const controls = uniforms({
  pixelation: uniform.float(12),
  tint: uniform.vec3([1, 1, 1]),
});
```

### Runtime Instance Uniform Updates — implemented

In addition to direct `.set(...)`, `createShader` exposes:

```ts
const shader = createShader(...);
shader.uniforms.pixelation.set(24);
```

### Name Customization

Maybe allow explicit GLSL names:

```ts
uniform.float(12, { glslName: "u_pixelation" });
```

But default key-to-`u_key` naming should be enough initially.

---

## First Target Use Case: Pixelated Texture Shader

Desired app code:

```ts
const pixelation = uniform.float(8);
const texture = uniform.texture2D("/photo.jpg");

createShader({
  canvas,
  fragment: pixelatedTextureFragment,
  uniforms: {
    pixelation,
    texture,
  },
});
```

Desired shader concepts:

```ts
const textureAR = $.u.textureResolution.x.div(
  $.u.textureResolution.y,
);
const canvasAR = $.resolution.x.div($.resolution.y);

const useXScale = step(canvasAR, textureAR);
const uvScale = mix(
  vec2(1.0, textureAR.div(canvasAR)),
  vec2(canvasAR.div(textureAR), 1.0),
  useXScale,
);

const adjustedUV = $.let("adjustedUV", $.uv.sub(0.5).mul(uvScale).add(0.5));

// pixelation uses $.u.pixelation
// texture sampling uses texture($.u.texture, vec2(x, y))
```

---

## Resolved Phase 1 Decisions

### `$.u` Accessor

Use `$.u` in Phase 1.

```ts
$.u.pixelation
```

Avoid `$.uniform("pixelation", "float")` unless dynamic proxy typing becomes unexpectedly difficult. Phase 1 can type `$.u` loosely; Phase 2 will improve inference.

### Raw GLSL String Fragments

Custom uniforms should work with raw GLSL string fragments at runtime.

For raw GLSL:

- runtime uploads custom uniforms
- user must manually declare uniforms in GLSL

Example:

```glsl
uniform float u_pixelation;
```

For DSL fragments:

- compiler emits custom uniform declarations automatically

### Reserved Names and Naming Rules

Throw early with clear errors for invalid custom uniform names.

Reserved keys:

```ts
time
resolution
mouse
fragCoord
uv
u
```

Also reject keys that already start with `u_`.

The naming rule is:

```ts
pixelation -> u_pixelation
```

So this should be invalid:

```ts
uniforms: {
  u_pixelation: uniform.float(12),
}
```

Suggested error:

```txt
Custom uniform key "u_pixelation" should not include the "u_" prefix. Use "pixelation"; it will compile to "u_pixelation".
```

### Dirty Tracking

Calling `.set(...)` with an unchanged value should **not** mark a uniform dirty.

For Phase 1 scalar/vector uniforms, use shallow equality:

```ts
pixelation.set(12); // no-op if current value is already 12
```

### Built-In Uniforms

Keep built-ins special-cased for Phase 1:

```ts
$.time
$.resolution
$.mouse
```

Do not move these onto the custom uniform system yet.

### Phase 1 Uniform Types

Only support:

```ts
uniform.float(...)
uniform.vec2(...)
uniform.vec3(...)
uniform.vec4(...)
```

Do not support `int`, `bool`, matrices, arrays, or textures in Phase 1.

### Upload Timing

`.set(...)` only updates the cached value and marks the uniform dirty.

Dirty uniforms are uploaded during the render loop before drawing.

This keeps WebGL calls inside the renderer lifecycle instead of app event handlers.

### Unused Uniforms

If GLSL optimizes away an unused uniform, `gl.getUniformLocation(...)` may return `null`.

This should not throw. Skip upload for that uniform.

A dev warning can be considered later, but is not required for Phase 1.

---

## Remaining Open Questions

These do not block the completed implementation.

- Should texture uniforms eventually get an object-like API?
  - Current implemented API: `$.u.texture` and `$.u.textureResolution`
  - Possible future API: `$.u.texture.sample(uv)` and `$.u.texture.resolution`
- Should built-ins eventually move onto the same uniform system internally?


---

## Documentation cleanup notes

- Updated stale `$.uniforms...` examples to the implemented `$.u...` API.
- Marked `shader.uniforms` as implemented rather than hypothetical Phase 6 work.
- Updated the local upload file picker example to match the implemented browser-supported MIME filter: PNG, JPEG, WebP, and GIF.
- Clarified that the flat texture API, `$.u.texture` plus `$.u.textureResolution`, is the current implemented API; object-like texture access remains future work.
