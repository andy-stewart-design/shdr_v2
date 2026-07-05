# Schema-First Uniforms Implementation Plan

## Context

This plan implements the schema-first uniforms design from `plans/schema-uniforms-prd.md`.

Current uniforms are authored as runtime objects:

```ts
uniform.float(12);
uniform.texture2D("/image.jpg");
```

The new model makes authored uniforms plain schema data. `createShader(...)` creates live runtime handles and returns them at `shader.u`.

**Key design decisions:**

- This is a breaking change; update all repo sketches rather than preserving compatibility.
- Authored uniforms use `type`, not `kind`.
- Preferred authoring is `defineUniforms((u) => ({ ... }))`.
- Longform schemas with `satisfies UniformSchema` remain supported.
- Runtime uniform handles are returned from `createShader(...)` at `shader.u`.
- `shader.uniforms` is removed/replaced by `shader.u`.
- Options objects for `u.float(...)`, `u.vec*`, and `u.texture2D(...)` are optional.
- Texture `accept` uses clean file extensions, e.g. `accept: ["png", "jpeg", "webp", "gif"]`.
- No `toDisplay` / `fromDisplay` support in schema.

---

## Phase 1 — Schema types and `defineUniforms`

### Step 1.1 — Replace public uniform authoring types

**Files:**

- `src/shdr/uniform.ts`
- `src/shdr/index.ts`

Define schema types:

```ts
type TextureSource = string | File | Blob;
type TextureFileExtension = "png" | "jpg" | "jpeg" | "webp" | "gif";

type BaseUniformSpec<TType extends string, TValue> = {
  type: TType;
  value: TValue;
  label?: string;
};

type FloatUniformSpec = BaseUniformSpec<"float", number> & {
  min?: number;
  max?: number;
  step?: number;
};

type Vec2UniformSpec = BaseUniformSpec<"vec2", [number, number]>;
type Vec3UniformSpec = BaseUniformSpec<"vec3", [number, number, number]>;
type Vec4UniformSpec = BaseUniformSpec<
  "vec4",
  [number, number, number, number]
>;

type Texture2DUniformSpec = BaseUniformSpec<"texture2D", TextureSource> & {
  accept?: TextureFileExtension[];
};

type UniformSpec =
  | FloatUniformSpec
  | Vec2UniformSpec
  | Vec3UniformSpec
  | Vec4UniformSpec
  | Texture2DUniformSpec;

type UniformSchema = Record<string, UniformSpec>;
```

Export:

```ts
UniformSchema;
UniformSpec;
TextureSource;
TextureFileExtension;
```

**Acceptance criteria:**

- [ ] `UniformSchema` is exported from `src/shdr/index.ts`.
- [ ] Existing code can import `type UniformSchema`.
- [ ] `pnpm check` passes after types are introduced, before migration.

---

### Step 1.2 — Add `defineUniforms`

**Files:**

- `src/shdr/uniform.ts`
- `src/shdr/index.ts`

Implement:

```ts
export function defineUniforms<U extends UniformSchema>(
  define: (u: UniformSpecHelpers) => U,
): U;
```

Helper API:

```ts
u.float(value: number, options?: FloatUniformOptions): FloatUniformSpec
u.vec2(value: [number, number], options?: VecUniformOptions): Vec2UniformSpec
u.vec3(value: [number, number, number], options?: VecUniformOptions): Vec3UniformSpec
u.vec4(value: [number, number, number, number], options?: VecUniformOptions): Vec4UniformSpec
u.texture2D(value: TextureSource, options?: TextureUniformOptions): Texture2DUniformSpec
```

The helper returns plain schema objects:

```ts
u.float(12, { min: 2 });
// { type: "float", value: 12, min: 2 }
```

**Acceptance criteria:**

- [ ] This typechecks:

```ts
export const uniforms = defineUniforms((u) => ({
  dpi: u.float(12, { min: 2, max: 40, step: 1 }),
  texture: u.texture2D("/image.jpg", { accept: ["png", "jpeg"] }),
}));
```

- [ ] `type` remains a literal type, not widened to `string`.
- [ ] `pnpm check` passes.

---

## Phase 2 — Compiler schema support

### Step 2.1 — Update uniform validation

**Files:**

- `src/shdr/uniform.ts`

Update validation to accept `UniformSchema` instead of runtime `UniformMap`.

Validation rules remain:

- reject keys starting with `u_`
- reject reserved keys:
  - `time`
  - `resolution`
  - `mouse`
  - `coord`
  - `uv`
  - `u`

Also validate spec types:

```ts
float;
vec2;
vec3;
vec4;
texture2D;
```

**Acceptance criteria:**

- [ ] Invalid names throw clear errors.
- [ ] Invalid `type` values throw clear errors.
- [ ] Existing name collision tests/manual checks still behave as before.

---

### Step 2.2 — Update type mapping for `$.u`

**Files:**

- `src/shdr/types.ts`

Change `UniformExprs` to map from schema specs:

```ts
{ type: "float" }     -> ExprProxy<"float">
{ type: "vec2" }      -> ExprProxy<"vec2">
{ type: "vec3" }      -> ExprProxy<"vec3">
{ type: "vec4" }      -> ExprProxy<"vec4">
{ type: "texture2D" } -> ExprProxy<"sampler2D">
```

Keep generated texture resolution access:

```ts
$.u.textureResolution -> ExprProxy<"vec2">
```

**Acceptance criteria:**

- [ ] `FragmentFn<typeof uniforms>` correctly types `$.u.dpi` as `ExprProxy<"float">`.
- [ ] `$.u.texture` is typed as `ExprProxy<"sampler2D">`.
- [ ] `$.u.textureResolution` is typed as `ExprProxy<"vec2">`.

---

### Step 2.3 — Update `compileFragment`

**Files:**

- `src/shdr/compile.ts`

Change options from runtime uniform map to schema:

```ts
compileFragment(fragment, { uniforms });
```

Use `spec.type` instead of `uniform.kind`.

GLSL emission:

```ts
float     -> uniform float u_name;
vec2      -> uniform vec2 u_name;
vec3      -> uniform vec3 u_name;
vec4      -> uniform vec4 u_name;
texture2D -> uniform sampler2D u_name;
             uniform vec2 u_name_resolution;
```

**Acceptance criteria:**

- [ ] Generated GLSL for existing uniform shaders is unchanged except implementation details.
- [ ] Texture uniforms still emit sampler + resolution.
- [ ] Unknown `$.u.foo` still throws a clear compile-time/runtime compilation error.

---

## Phase 3 — Runtime live uniform handles

### Step 3.1 — Introduce runtime uniform handles

**Files:**

- `src/shdr/runtime.ts`
- possibly `src/shdr/uniform.ts`

Define internal runtime handle shape:

```ts
type RuntimeUniform<TValue, TSpec> = {
  readonly schema: TSpec;
  get(): TValue;
  set(value: TValue): void;
};
```

Runtime internals may add dirty tracking privately:

```ts
consumeDirty(): boolean
```

but that should not be part of the public type unless needed.

**Acceptance criteria:**

- [ ] Runtime handles expose `.schema`, `.get()`, `.set()`.
- [ ] Dirty tracking still works internally.
- [ ] `.set(sameValue)` does not mark scalar/vector uniforms dirty.

---

### Step 3.2 — Runtime creates handles from schema

**Files:**

- `src/shdr/runtime.ts`

`createShader({ canvas, fragment, uniforms })` receives schema and creates runtime handles internally.

Return shape changes from:

```ts
shader.uniforms;
```

to:

```ts
shader.u;
```

Example:

```ts
const shader = createShader({ canvas, fragment, uniforms });
shader.u.dpi.set(24);
shader.u.dpi.get();
```

**Acceptance criteria:**

- [ ] `ShaderInstance<typeof uniforms>["u"]` is typed from schema.
- [ ] `shader.u.dpi.set(...)` works.
- [ ] `shader.u.texture.set(file)` works.
- [ ] `shader.uniforms` no longer exists.

---

### Step 3.3 — Texture runtime handling from schema

**Files:**

- `src/shdr/runtime.ts`

Texture specs use:

```ts
{ type: "texture2D", value: TextureSource, accept?: TextureFileExtension[] }
```

Runtime behavior remains:

- create placeholder texture
- load URL/File/Blob
- keep old texture active while new source loads
- ignore stale loads
- revoke object URLs after load/error
- update `u_name_resolution`

**Acceptance criteria:**

- [ ] URL texture loading still works.
- [ ] File upload still works.
- [ ] `shader.u.texture.set(file)` reloads texture.
- [ ] Texture resolution uniform still updates after load.

---

## Phase 4 — Controls migration

### Step 4.1 — Update low-level control helpers

**Files:**

- `src/controls.ts`

Update helpers to consume runtime handles from `shader.u`, not authored schemas.

Example:

```ts
addFloatUniformControl(gui, "dpi", shader.u.dpi);
```

The helper should read metadata from:

```ts
runtimeUniform.schema;
```

If explicit options are still supported, they should override schema metadata.

**Acceptance criteria:**

- [ ] Float controls use `schema.label`, `schema.min`, `schema.max`, `schema.step` by default.
- [ ] Texture upload control maps `schema.accept` extensions to MIME accept strings.
- [ ] Existing sketch controls work after migration.

---

### Step 4.2 — Add schema-driven `addUniformControls`

**Files:**

- `src/controls.ts`

Add convenience helper:

```ts
addUniformControls(gui, shader);
```

Behavior:

- float -> slider/control using metadata
- texture2D -> URL field + upload button
- vec2/vec3/vec4 -> can be skipped initially or represented as grouped numeric fields if simple

**Acceptance criteria:**

- [ ] Ben Day can wire controls with `addUniformControls(gui, shader)`.
- [ ] Pixelation can wire texture + pixelation controls with `addUniformControls(gui, shader)`.
- [ ] Unsupported vector controls are either skipped cleanly or minimally supported.

---

## Phase 5 — Migrate sketches

### Step 5.1 — Ben Day Spotlight

**Files:**

- `src/fragments/ben-day-spotlight/fragment.shdr.ts`
- `src/fragments/ben-day-spotlight/index.ts`

Change schema:

```ts
export const uniforms = defineUniforms((u) => ({
  dpi: u.float(12, { min: 2, max: 40, step: 1 }),
  spread: u.float(0.625, { min: 0.1, max: 1, step: 0.01 }),
  blur: u.float(0, { min: 0, max: 10, step: 0.1 }),
}));
```

Use:

```ts
const shader = createShader({ canvas, fragment, uniforms });
addUniformControls(gui, shader);
```

**Acceptance criteria:**

- [ ] Shader renders.
- [ ] Controls work.
- [ ] `pnpm check` passes.

---

### Step 5.2 — Pixelation

**Files:**

- `src/fragments/pixelation/fragment.shdr.ts`
- `src/fragments/pixelation/index.ts`

Change schema:

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

Remove `toUniform` / `fromUniform` usage.

**Acceptance criteria:**

- [ ] Shader renders.
- [ ] URL texture control works.
- [ ] Upload texture control works.
- [ ] Pixelation control works using physical-pixel value.

---

### Step 5.3 — Other sketches

Check all remaining sketches for uniform usage.

Expected:

- `moby-gradient`: no custom uniforms
- `circles`: no custom uniforms
- `horizon-burn`: no custom uniforms

**Acceptance criteria:**

- [ ] All sketches compile.
- [ ] `pnpm check` passes.
- [ ] `pnpm build` passes.

---

## Phase 6 — Documentation and cleanup

### Step 6.1 — Update README

**Files:**

- `README.md`

Replace old uniform examples:

```ts
uniform.float(12);
```

with schema-first examples:

```ts
defineUniforms((u) => ({
  dpi: u.float(12),
}));
```

Document:

- `defineUniforms`
- longform `UniformSchema`
- `shader.u`
- metadata-driven controls
- texture `accept` extension strings

**Acceptance criteria:**

- [ ] README no longer recommends old runtime-uniform authoring API.
- [ ] README includes `shader.u.dpi.set(...)` example.

---

### Step 6.2 — Remove/deprecate old public API

**Files:**

- `src/shdr/index.ts`
- `src/shdr/uniform.ts`

Remove or stop exporting old public `uniform.float(...)` helpers if they conflict with the new model.

If internal helpers are still useful, keep them internal and rename to avoid public confusion.

**Acceptance criteria:**

- [ ] Public API exports schema helpers, not runtime uniform factories.
- [ ] No repo code imports old `uniform` authoring helper.
- [ ] `pnpm check` passes.

---

## Phase 7 — Final validation

Run:

```bash
pnpm check
pnpm build
```

Manual smoke tests:

- [ ] Ben Day Spotlight controls
- [ ] Pixelation URL texture
- [ ] Pixelation uploaded texture
- [ ] Moby Gradient
- [ ] Circles
- [ ] Horizon Burn

Inspect generated GLSL for at least one uniform fragment and verify uniform declarations are unchanged:

```glsl
uniform float u_dpi;
uniform sampler2D u_texture;
uniform vec2 u_texture_resolution;
```

---

## Implementation Notes

- Prefer small commits by phase or sub-phase.
- Keep the compiler-facing schema and runtime live handles distinct.
- Avoid adding display transform functions to schema.
- If vector GUI controls become fiddly, skip them for MVP rather than blocking schema migration.
- This migration should happen before the runtime entrypoint split because it clarifies the compiler/runtime boundary.
