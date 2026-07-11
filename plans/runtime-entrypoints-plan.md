# Runtime Entrypoints Implementation Plan

## Context

This plan implements the local entrypoint split described in `plans/runtime-entrypoints-prd.md`.

The repo already has an important intermediate boundary:

- `.shdr.ts` modules contain shader authoring code, uniform schemas, and `compileFragment(...)` calls.
- normal `.ts` sketch modules contain DOM/runtime setup.

The next step is to make the runtime boundary explicit in imports:

```ts
import { createShader } from "../../shdr/webgl.ts";
```

while authoring/compiler imports remain in `.shdr.ts` modules:

```ts
import {
  compileFragment,
  defineUniforms,
  type FragmentFn,
} from "../../shdr/index.ts";
```

**Key design decisions:**

- Use backend-specific runtime entrypoints: `shdr/webgl`, future `shdr/webgpu`.
- Keep `src/shdr/index.ts` as the authoring/compiler API.
- Add a local `src/shdr/webgl.ts` entrypoint before package `exports` work.
- Keep `createShader` exported from `src/shdr/index.ts` temporarily for backwards compatibility.
- Do not implement WebGPU in this plan.
- Do not implement full Vite/build-time shader artifact emission in this plan.
- Treat compiled shader artifact support as a separate phase after the local entrypoint split.

---

## Phase 1 — Local WebGL runtime entrypoint

### Step 1.1 — Add `src/shdr/webgl.ts`

**Files:**

- `src/shdr/webgl.ts`

Create a backend-specific WebGL runtime entrypoint:

```ts
export { createShader } from "./runtime.ts";
export type { ShaderOptions, ShaderInstance } from "./runtime.ts";
```

This file should not re-export compiler/AST/DSL APIs.

**Acceptance criteria:**

- [ ] `src/shdr/webgl.ts` exists.
- [ ] `createShader` can be imported from `src/shdr/webgl.ts`.
- [ ] `ShaderOptions` and `ShaderInstance` types can be imported from `src/shdr/webgl.ts`.
- [ ] `pnpm check` passes.

---

### Step 1.2 — Keep existing root runtime export temporarily

**Files:**

- `src/shdr/index.ts`

Keep this export for now:

```ts
export { createShader } from "./runtime.ts";
export type { ShaderOptions, ShaderInstance } from "./runtime.ts";
```

Add a TODO/comment if useful, but do not remove it yet. The goal of this phase is to introduce the split without forcing every internal or future external consumer to move at once.

**Acceptance criteria:**

- [ ] Existing root import still works:

```ts
import { createShader } from "../../shdr/index.ts";
```

- [ ] Preferred new import also works:

```ts
import { createShader } from "../../shdr/webgl.ts";
```

- [ ] `pnpm check` passes.

---

## Phase 2 — Migrate local sketches to `shdr/webgl`

### Step 2.1 — Update sketch runtime imports

**Files:**

- `src/fragments/ben-day-spotlight/index.ts`
- `src/fragments/circles/index.ts`
- `src/fragments/horizon-burn/index.ts`
- `src/fragments/moby-gradient/index.ts`
- `src/fragments/pixelation/index.ts`
- `src/fragments/plasma/index.ts`

Change runtime imports from:

```ts
import { createShader } from "../../shdr/index.ts";
```

to:

```ts
import { createShader } from "../../shdr/webgl.ts";
```

The sketch `index.ts` files should not import `compileFragment`, `defineUniforms`, `fn`, or shader DSL helpers.

**Acceptance criteria:**

- [ ] All sketch `index.ts` files import `createShader` from `../../shdr/webgl.ts`.
- [ ] No sketch `index.ts` imports `compileFragment`.
- [ ] `.shdr.ts` files continue importing compiler/authoring APIs from `../../shdr/index.ts`.
- [ ] `pnpm check` passes.

---

### Step 2.2 — Validate fragment/runtime split

**Files:**

- `src/fragments/**/fragment.shdr.ts`
- `src/fragments/**/index.ts`

Verify the intended split:

- `fragment.shdr.ts` exports compiled `fragment` GLSL string.
- `fragment.shdr.ts` exports `uniforms` when the shader has custom uniforms.
- `index.ts` only handles DOM/runtime setup and controls.

Expected pattern:

```ts
// fragment.shdr.ts
const _fragment: FragmentFn<typeof uniforms> = ({ $ }) => {
  // shader DSL
};

export const fragment = compileFragment(_fragment, { uniforms });
```

```ts
// index.ts
const shader = createShader({ canvas, fragment, uniforms });
addUniformControls(gui, shader);
```

**Acceptance criteria:**

- [ ] All current shaders follow this split.
- [ ] Shaders without custom uniforms pass only `{ canvas, fragment }` to `createShader`.
- [ ] Shaders with custom uniforms pass `{ canvas, fragment, uniforms }` to `createShader`.
- [ ] `pnpm check` passes.
- [ ] `pnpm build` passes.

---

## Phase 3 — Documentation

### Step 3.1 — Update README imports

**Files:**

- `README.md`

Document the conceptual split:

```ts
import {
  compileFragment,
  defineUniforms,
  type FragmentFn,
} from "./shdr/index.ts";
import { createShader } from "./shdr/webgl.ts";
```

Explain:

- `shdr/index.ts` is currently the authoring/compiler API.
- `shdr/webgl.ts` is the WebGL runtime API.
- Future package shape should become `shdr` and `shdr/webgl`.

**Acceptance criteria:**

- [ ] README examples use `createShader` from `./shdr/webgl.ts` where runtime setup is shown.
- [ ] README still shows authoring/compiler imports from `./shdr/index.ts`.
- [ ] README mentions future package-style imports: `shdr` and `shdr/webgl`.
- [ ] `pnpm check` passes.

---

### Step 3.2 — Update plan/docs cross-references if needed

**Files:**

- `plans/runtime-entrypoints-prd.md`
- optionally `plans/compiler-next-steps.md`
- optionally `plans/dsl-completeness-prd.md`

Make sure docs consistently use:

```ts
shdr / webgl;
shdr / webgpu;
```

rather than generic runtime naming.

**Acceptance criteria:**

- [ ] Runtime docs prefer `shdr/webgl` and `shdr/webgpu` naming.
- [ ] No docs recommend a generic `shdr/runtime` as the primary import.
- [ ] `pnpm check` passes.

---

## Phase 4 — Runtime accepts compiled shader artifacts

This phase can be implemented in the same branch if desired, but it is separable from the local entrypoint split.

### Step 4.1 — Define compiled shader artifact type

**Files:**

- `src/shdr/runtime.ts`
- possibly `src/shdr/index.ts`

Add a type like:

```ts
export type CompiledShaderModule<U extends UniformSchema = UniformSchema> = {
  glsl: string;
  uniformSchema: U;
  inspectViews?: string[];
};
```

Open naming question: `uniformSchema` vs `uniforms`. Prefer `uniformSchema` in the type to make clear this is declarative schema data, not live runtime handles.

**Acceptance criteria:**

- [ ] `CompiledShaderModule` is exported from the appropriate public API.
- [ ] Artifact type uses schema data, not runtime uniform handles.
- [ ] `pnpm check` passes.

---

### Step 4.2 — Add `createShader({ canvas, shader })`

**Files:**

- `src/shdr/runtime.ts`
- `src/shdr/webgl.ts`

Support:

```ts
createShader({ canvas, shader });
```

where `shader` includes:

```ts
glsl: string;
uniformSchema: U;
```

Keep current support:

```ts
createShader({ canvas, fragment, uniforms });
```

for local development and backwards compatibility.

**Acceptance criteria:**

- [ ] `createShader({ canvas, shader })` compiles and runs.
- [ ] Runtime creates live `shader.u` handles from `shader.uniformSchema`.
- [ ] Existing `createShader({ canvas, fragment, uniforms })` still works.
- [ ] `pnpm check` passes.
- [ ] `pnpm build` passes.

---

### Step 4.3 — Optionally adapt one local shader to artifact shape

**Files:**

- one `src/fragments/**/fragment.shdr.ts`
- corresponding `index.ts`

Optionally export both current named pieces and an artifact object:

```ts
export const shader = {
  glsl: fragment,
  uniformSchema: uniforms,
};
```

Then consume:

```ts
createShader({ canvas, shader });
```

This is optional because the real goal is future Vite transform output.

**Acceptance criteria:**

- [ ] At least one shader can use artifact-style runtime input, if this step is chosen.
- [ ] Existing non-artifact usage still works.
- [ ] `pnpm check` passes.

---

## Phase 5 — Package/export-map follow-up

This phase is future-facing and may wait until the local shape stabilizes.

### Step 5.1 — Add package-style exports

**Files:**

- `package.json`
- possibly build config files

When this project is ready to be consumed as a package, add exports resembling:

```json
{
  "exports": {
    ".": "./dist/shdr/index.js",
    "./webgl": "./dist/shdr/webgl.js",
    "./vite": "./dist/vite-plugin-shdr.js"
  }
}
```

Exact paths depend on final build output.

**Acceptance criteria:**

- [ ] `shdr` resolves to authoring/compiler API.
- [ ] `shdr/webgl` resolves to WebGL runtime API.
- [ ] `shdr/vite` resolves to Vite plugin API.
- [ ] WebGL runtime import does not require compiler internals unless needed by current runtime compilation compatibility.

---

## Phase 6 — Future build-time `.shdr.ts` artifacts

This is intentionally not part of the initial entrypoint split, but the split prepares for it.

### Step 6.1 — Vite transform emits shader artifacts

**Files:**

- `src/transform/**`
- `src/vite-plugin-shdr.ts`

Future import forms:

```ts
import shader from "./fragment.shdr.ts";
import glsl from "./fragment.shdr.ts?glsl";
```

The generated module should avoid shipping the authoring DSL/compiler to the browser in production where possible.

**Acceptance criteria:**

- [ ] `.shdr.ts` can emit a compiled shader artifact.
- [ ] Artifact includes GLSL and uniform schema.
- [ ] Runtime can consume the artifact through `createShader({ canvas, shader })`.
- [ ] Existing development workflow remains ergonomic.

---

## Final Validation

Run:

```bash
pnpm format
pnpm lint
pnpm check
pnpm build
```

Manual smoke tests:

- [ ] Ben Day Spotlight renders and controls work.
- [ ] Pixelation renders, URL texture loads, and upload works.
- [ ] Plasma renders and controls work.
- [ ] Moby Gradient renders.
- [ ] Circles renders.
- [ ] Horizon Burn renders.

---

## Implementation Notes

- Prefer committing after each step or phase once checks pass.
- Do not commit directly to `main`; ask first if currently on `main`.
- Keep compiler/authoring APIs out of `src/shdr/webgl.ts`.
- Keep root `createShader` export temporarily, then revisit once examples/docs have fully moved to `shdr/webgl`.
- Treat WebGPU as a future parallel backend, not a requirement for this implementation.
- Treat package `exports` and Vite build-time artifacts as follow-up phases unless explicitly pulled into scope.
