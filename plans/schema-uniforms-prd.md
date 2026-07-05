# PRD: Schema-First Uniforms

## Problem

The current custom uniform API uses runtime objects as the authored uniform definition:

```ts
export const uniforms = {
  dpi: uniform.float(12),
  texture: uniform.texture2D("/image.jpg"),
};
```

Those objects mix several concerns:

1. compile-time schema/type information
2. default values
3. runtime mutable state
4. dirty tracking
5. texture loading behavior

This was useful for prototyping, but it makes future build-time/server-side shader compilation harder because the `uniforms` object is not just declarative data.

We want uniforms to be schema-first: authored uniforms should be plain metadata plus default values. Runtime uniform objects should be created by `createShader(...)` and returned to users.

---

## Goals

- Replace authored runtime uniform objects with schema data.
- Keep uniform definitions ergonomic.
- Support both helper-based and longform schema authoring.
- Return live runtime uniform handles from `createShader(...)` at `shader.u`.
- Preserve typed `$.u.foo` shader access.
- Make uniform metadata useful for GUI generation.
- Align with future build-time compilation, where uniform schema can be included in compiled shader artifacts.

---

## Non-Goals

- Do not preserve the existing `uniform.float(...)` authoring API if it gets in the way.
- Do not keep `toDisplay` / `fromDisplay` transform functions in schema.
- Do not solve CSS-pixel vs physical-pixel display transforms in this API.
- Do not implement build-time compiled shader artifacts as part of this change.
- Do not require users to use helper functions; plain schemas should also work.

---

## Proposed API

### Preferred helper style

```ts
import { defineUniforms, type FragmentFn } from "../../shdr/index.ts";

export const uniforms = defineUniforms((u) => ({
  dpi: u.float(12, { min: 2, max: 40, step: 1 }),
  spread: u.float(0.625, { min: 0.1, max: 1, step: 0.01 }),
  blur: u.float(0, { min: 0, max: 10, step: 0.1 }),
}));

export const fragment: FragmentFn<typeof uniforms> = ({ $ }) => {
  const dpi = $.u.dpi;
  const spread = $.u.spread;
  const blur = $.u.blur;
};
```

`defineUniforms(...)` returns plain schema objects. It is not a runtime uniform factory.

### Longform schema style

```ts
import type { UniformSchema } from "../../shdr/index.ts";

export const uniforms = {
  dpi: { type: "float", value: 12, min: 2, max: 40, step: 1 },
  spread: { type: "float", value: 0.625, min: 0.1, max: 1, step: 0.01 },
  blur: { type: "float", value: 0, min: 0, max: 10, step: 0.1 },
} satisfies UniformSchema;
```

Both styles should produce equivalent schema shapes.

---

## Uniform helper API

The options object is optional for all helpers.

```ts
u.float(value: number, options?: FloatUniformOptions)
u.vec2(value: [number, number], options?: VecUniformOptions)
u.vec3(value: [number, number, number], options?: VecUniformOptions)
u.vec4(value: [number, number, number, number], options?: VecUniformOptions)
u.texture2D(value: TextureSource, options?: TextureUniformOptions)
```

Examples:

```ts
const uniforms = defineUniforms((u) => ({
  pixelation: u.float(40),
  tint: u.vec3([1, 1, 1], { label: "Tint" }),
  texture: u.texture2D("/image.jpg"),
}));
```

With metadata:

```ts
const uniforms = defineUniforms((u) => ({
  pixelation: u.float(40, {
    label: "Pixelation",
    min: 1,
    max: 160,
    step: 1,
  }),
  texture: u.texture2D("/image.jpg", {
    label: "Texture",
    accept: ["png", "jpeg", "webp", "gif"],
  }),
}));
```

---

## Schema Types

### Base shape

```ts
type BaseUniformSpec<TType extends string, TValue> = {
  type: TType;
  value: TValue;
  label?: string;
};
```

### Float

```ts
type FloatUniformSpec = BaseUniformSpec<"float", number> & {
  min?: number;
  max?: number;
  step?: number;
};
```

### Vectors

```ts
type Vec2UniformSpec = BaseUniformSpec<"vec2", [number, number]>;
type Vec3UniformSpec = BaseUniformSpec<"vec3", [number, number, number]>;
type Vec4UniformSpec = BaseUniformSpec<
  "vec4",
  [number, number, number, number]
>;
```

Vector specs may eventually get component labels/min/max metadata, but that is not required for the MVP.

### Texture

```ts
type TextureSource = string | File | Blob;

type TextureFileExtension = "png" | "jpg" | "jpeg" | "webp" | "gif";

type Texture2DUniformSpec = BaseUniformSpec<"texture2D", TextureSource> & {
  accept?: TextureFileExtension[];
};
```

The authored schema uses clean extension strings:

```ts
accept: ["png", "jpeg", "webp", "gif"];
```

The runtime/control layer maps these to file input MIME values:

```ts
png  -> image/png
jpg  -> image/jpeg
jpeg -> image/jpeg
webp -> image/webp
gif  -> image/gif
```

Default accepted image formats:

```ts
["png", "jpg", "jpeg", "webp", "gif"];
```

### UniformSchema

```ts
type UniformSpec =
  | FloatUniformSpec
  | Vec2UniformSpec
  | Vec3UniformSpec
  | Vec4UniformSpec
  | Texture2DUniformSpec;

type UniformSchema = Record<string, UniformSpec>;
```

---

## Runtime API

`createShader(...)` receives schema:

```ts
const shader = createShader({ canvas, fragment, uniforms });
```

and returns live runtime uniform handles:

```ts
shader.u.dpi.get();
shader.u.dpi.set(24);
shader.u.texture.set(file);
```

This mirrors shader-side access:

```ts
$.u.dpi;
$.u.texture;
```

### Runtime uniform handles

Runtime handles are created internally from schema:

```ts
type RuntimeUniform<TValue, TSpec> = {
  readonly schema: TSpec;
  get(): TValue;
  set(value: TValue): void;
};
```

The runtime may keep internal dirty-tracking methods private.

### ShaderInstance

```ts
interface ShaderInstance<U extends UniformSchema = UniformSchema> {
  readonly u: RuntimeUniforms<U>;
  destroy(): void;
}
```

`shader.uniforms` should be removed or replaced by `shader.u` as a breaking change.

---

## Compiler Changes

`compileFragment(fragment, { uniforms })` now receives schema, not runtime uniform objects.

Where code previously read:

```ts
uniform.kind;
```

it should now read:

```ts
uniform.type;
```

GLSL emission remains the same:

```ts
{ type: "float" }     -> uniform float u_name;
{ type: "vec2" }      -> uniform vec2 u_name;
{ type: "vec3" }      -> uniform vec3 u_name;
{ type: "vec4" }      -> uniform vec4 u_name;
{ type: "texture2D" } -> uniform sampler2D u_name;
                         uniform vec2 u_name_resolution;
```

Shader context typing maps schema to expression proxies:

```ts
{ type: "float" }     -> ExprProxy<"float">
{ type: "vec2" }      -> ExprProxy<"vec2">
{ type: "vec3" }      -> ExprProxy<"vec3">
{ type: "vec4" }      -> ExprProxy<"vec4">
{ type: "texture2D" } -> ExprProxy<"sampler2D">
```

Texture resolution remains available as:

```ts
$.u.textureResolution;
```

until/unless the future texture object API lands.

---

## GUI / Controls

Schema metadata enables schema-driven controls.

Possible helper:

```ts
const shader = createShader({ canvas, fragment, uniforms });
addUniformControls(gui, shader);
```

For float specs:

```ts
u.float(12, { label: "DPI", min: 2, max: 40, step: 1 });
```

control uses:

- `label`
- `min`
- `max`
- `step`

For texture specs:

```ts
u.texture2D("/image.jpg", {
  label: "Texture",
  accept: ["png", "jpeg", "webp", "gif"],
});
```

control can provide:

- URL string field
- upload button
- accepted file formats mapped from extensions

Existing low-level helpers may still exist, but should consume runtime handles from `shader.u`, not authored schemas.

---

## Pixelation / DPR Note

The previous GUI helper supported `toUniform` / `fromUniform` functions to display CSS-pixel values while storing physical-pixel values.

This should not be part of uniform schema.

For now, pixelation can be authored directly in physical pixels:

```ts
pixelation: u.float(40 * devicePixelRatio, {
  min: 1,
  max: 160,
  step: 1,
});
```

If display units become important later, prefer declarative metadata like:

```ts
unit: "cssPixel";
```

rather than arbitrary transform functions in schema.

---

## Migration Examples

### Ben Day Spotlight

Before:

```ts
export const uniforms = {
  dpi: uniform.float(12),
  spread: uniform.float(0.625),
  blur: uniform.float(0),
};
```

After:

```ts
export const uniforms = defineUniforms((u) => ({
  dpi: u.float(12, { min: 2, max: 40, step: 1 }),
  spread: u.float(0.625, { min: 0.1, max: 1, step: 0.01 }),
  blur: u.float(0, { min: 0, max: 10, step: 0.1 }),
}));
```

Runtime controls:

```ts
const shader = createShader({ canvas, fragment, uniforms });
addUniformControls(gui, shader);
```

### Pixelation

Before:

```ts
export const uniforms = {
  texture: uniform.texture2D("https://shdr.andystew.art/abstract.jpg"),
  pixelation: uniform.float(40 * devicePixelRatio),
};
```

After:

```ts
export const uniforms = defineUniforms((u) => ({
  texture: u.texture2D("https://shdr.andystew.art/abstract.jpg", {
    label: "Texture",
    accept: ["png", "jpeg", "webp", "gif"],
  }),
  pixelation: u.float(40 * devicePixelRatio, {
    label: "Pixelation",
    min: 1,
    max: 160,
    step: 1,
  }),
}));
```

---

## Build-Time Compilation Alignment

Schema-first uniforms make future compiled shader artifacts cleaner.

A compiled shader artifact can include:

```ts
type CompiledShader = {
  glsl: string;
  uniformSchema: UniformSchema;
  inspectViews?: string[];
};
```

Runtime can then receive:

```ts
createShader({ canvas, shader, uniforms });
```

where `uniforms` is schema or runtime-created state derived from schema.

The important change is that the compiled artifact no longer needs to serialize runtime dirty-tracking objects.

---

## Suggested Implementation Steps

1. Define schema types:
   - `UniformSchema`
   - `UniformSpec`
   - individual spec types
2. Add `defineUniforms((u) => ({ ... }))` helper.
3. Change compiler uniform handling from `kind` to `type`.
4. Change runtime to create live uniform handles internally from schema.
5. Replace `shader.uniforms` with `shader.u`.
6. Update controls to consume `shader.u` and read metadata from `runtimeUniform.schema`.
7. Update existing `.shdr.ts` sketches.
8. Remove or deprecate public `uniform.float(...)` authoring helpers.
9. Update README/docs.

---

## Resolved Decisions

### Recommended authoring style

`defineUniforms((u) => ({ ... }))` is the recommended authoring style.

Longform object schemas remain supported, but examples should use:

```ts
satisfies UniformSchema
```

to avoid type widening.

### Runtime uniform handles

`shader.u` should keep dirty-tracking internals private.

Public runtime handles expose:

```ts
schema;
get();
set(value);
```

The renderer owns upload scheduling and dirty tracking.

### Controls API

`addUniformControls(gui, shader)` should be the primary controls API for sketches/demos.

Lower-level helpers can remain available, but the happy path should use schema metadata automatically.

### Texture controls

Texture controls should be generated automatically from `texture2D` specs.

For each texture uniform, controls should include:

- URL/string field
- upload button

Default accepted file extensions:

```ts
["png", "jpg", "jpeg", "webp", "gif"];
```

### Old `uniform.*` API

Remove the old public `uniform.float(...)` / `uniform.texture2D(...)` authoring API rather than keeping aliases.

This project is still a prototype, so a clean breaking change is preferred over compatibility shims.
