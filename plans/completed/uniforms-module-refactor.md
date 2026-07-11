# Uniforms Module Refactor Plan

## Goal

Centralize uniform-related code under a dedicated `src/shdr/uniforms/` module tree.

Uniform behavior is currently spread across:

- `src/shdr/uniform.ts`
  - schema types
  - schema helper construction
  - runtime JS-side uniform handles
  - validation
- `src/shdr/compile.ts`
  - GLSL uniform declaration emission
  - `$.u` expression proxy creation
  - texture uniform expression helpers
- `src/shdr/runtime.ts`
  - WebGL uniform location lookup
  - uniform upload logic
  - texture loading/upload logic
  - runtime uniform type guards

Now that uniforms are schema-only, this logic can be organized more clearly.

## Desired shape

Proposed module layout:

```txt
src/shdr/uniforms/
  index.ts
  schema.ts
  runtime.ts
  validation.ts
  compile.ts
  webgl.ts
```

### `schema.ts`

Owns public uniform schema types and helpers:

- `UniformKind`
- `TextureSource`
- `TextureFileExtension`
- `BaseUniformSpec`
- `FloatUniformSpec`
- `Vec2UniformSpec`
- `Vec3UniformSpec`
- `Vec4UniformSpec`
- `Texture2DUniformSpec`
- `UniformSpec`
- `UniformSchema`
- `FloatUniformOptions`
- `VecUniformOptions`
- `TextureUniformOptions`
- `UniformSpecHelpers`
- `defineUniforms`

### `runtime.ts`

Owns JS-side live uniform handles:

- `RuntimeUniform`
- `InternalRuntimeUniform`
- `RuntimeUniforms`
- `InternalRuntimeUniforms`
- `createRuntimeUniforms`
- dirty tracking
- value copying/equality helpers

These are not WebGL bindings. They are live JS handles exposed as `shader.u`.

### `validation.ts`

Owns schema validation:

- valid uniform type set
- reserved uniform keys
- `validateUniformMap`

Potential rename later: `validateUniformSchema` may be clearer now that `UniformMap` is gone.

### `compile.ts`

Owns compile-time uniform behavior:

- `texture2D` -> `sampler2D` mapping
- GLSL uniform declaration emission
- `$.u.foo` proxy creation
- texture uniform proxy behavior:
  - `$.u.texture`
  - `$.u.texture.resolution`
  - `$.u.texture.sample(...)`
- optional helper for legacy `${name}Resolution` access if retained

Possible exports:

```ts
uniformKindToGlslType(kind);
emitUniformDeclarations(uniforms);
createUniformExprs(uniforms);
```

### `webgl.ts`

Owns runtime WebGL binding/upload behavior:

- WebGL uniform location lookup
- scalar/vector upload logic
- texture unit binding
- texture image loading/uploading
- texture resolution uniform updates
- WebGL resource cleanup
- runtime uniform type guards

Potential exported type/function names:

```ts
type WebGLUniformBinding
function createWebGLUniformBinding(...)
```

This should replace the current `makeRuntimeUniform` helper in `src/shdr/runtime.ts`.

## Refactor steps

Each step should compile independently.

### Step 1: Create uniforms barrel

Add:

```txt
src/shdr/uniforms/index.ts
```

Initially re-export everything from the existing `src/shdr/uniform.ts`.

No behavior changes.

### Step 2: Move schema/types/helpers

Create:

```txt
src/shdr/uniforms/schema.ts
```

Move schema-related exports from `src/shdr/uniform.ts`.

Re-export them from `src/shdr/uniforms/index.ts`.

Keep `src/shdr/uniform.ts` temporarily as a compatibility barrel.

### Step 3: Move JS runtime handles

Create:

```txt
src/shdr/uniforms/runtime.ts
```

Move:

- `RuntimeUniform`
- `InternalRuntimeUniform`
- `RuntimeUniforms`
- `InternalRuntimeUniforms`
- `createRuntimeUniforms`
- `equalValue`
- `copyValue`

Re-export public types/functions from `src/shdr/uniforms/index.ts`.

### Step 4: Move validation

Create:

```txt
src/shdr/uniforms/validation.ts
```

Move:

- `UNIFORM_TYPES`
- `RESERVED_UNIFORM_KEYS`
- `validateUniformMap`

Keep the function name for now to reduce churn, but consider later renaming to `validateUniformSchema`.

### Step 5: Update imports

Update internal imports to use the new module tree or barrel:

- `src/shdr/compile.ts`
- `src/shdr/runtime.ts`
- `src/shdr/types.ts`
- `src/shdr/index.ts`

Keep:

```ts
// src/shdr/uniform.ts
export * from "./uniforms";
```

Run:

```sh
npx tsc --noEmit
```

### Step 6: Extract compile-side helpers

Create:

```txt
src/shdr/uniforms/compile.ts
```

Move uniform-specific compile helpers out of `src/shdr/compile.ts`.

Candidate helpers:

```ts
function uniformKindToGlslType(kind: UniformKind): GlslType;
function emitUniformDeclarations(uniforms: UniformSchema): string[];
function createUniformExprs(
  uniforms: UniformSchema,
): UniformExprs<UniformSchema>;
```

`compileFragment` should delegate uniform declaration/proxy logic to this module.

### Step 7: Extract WebGL uniform bindings

Create:

```txt
src/shdr/uniforms/webgl.ts
```

Move `makeRuntimeUniform` and related type guards from `src/shdr/runtime.ts`.

Rename the concept from `RuntimeUniform` to avoid confusion with JS-side runtime handles.

Suggested name:

```ts
type WebGLUniformBinding = {
  uniform: RuntimeUniformHandle;
  location: WebGLUniformLocation | null;
  bindSampler?(): void;
  apply(): void;
  destroy?(): void;
};
```

Suggested factory:

```ts
function createWebGLUniformBinding(...): WebGLUniformBinding
```

After this step, `src/shdr/runtime.ts` should mostly orchestrate:

- shader compilation/linking
- canvas/resize/mouse state
- render loop
- lifecycle cleanup

### Step 8: Naming cleanup

Consider renaming:

- `validateUniformMap` -> `validateUniformSchema`
- local runtime WebGL binding types to avoid colliding with public `RuntimeUniform`
- any remaining old names from the pre-schema API

This can be done after the mechanical extraction to reduce risk.

### Step 9: Compatibility barrel decision

Decide whether to keep:

```txt
src/shdr/uniform.ts
```

Options:

1. Keep it as a compatibility barrel:

   ```ts
   export * from "./uniforms";
   ```

2. Remove it and update all imports to `./uniforms`.

Since this project may have existing internal references, keeping the barrel initially is safer.

### Step 10: Final verification

Run:

```sh
npx tsc --noEmit
```

Search for stale names:

```sh
grep -R "UniformMap\|UniformInput\|isUniformSchema\|makeRuntimeUniform\|export const uniform" src
```

## Notes

This refactor should preserve public behavior. The main goal is clearer ownership:

- schema authoring lives in `uniforms/schema.ts`
- JS-side dirty runtime handles live in `uniforms/runtime.ts`
- validation lives in `uniforms/validation.ts`
- GLSL/proxy compile behavior lives in `uniforms/compile.ts`
- WebGL upload behavior lives in `uniforms/webgl.ts`

The largest behavior-sensitive area is texture upload, especially object URL cleanup, async load ordering, and texture resolution updates. That code should be moved carefully without semantic changes.
