# PRD: Compiler Artifacts and Deep Library Boundaries

## Summary

Refactor `src/shdr` so shader authoring is compiled at build/server time into a strictly JSON-serializable artifact. The browser-side WebGL runtime consumes that artifact without importing or knowing about the TypeScript DSL, expression proxies, AST construction, or compiler.

This work prioritizes deep, comprehensible modules and testable boundaries over compatibility with the current experimental API. It preserves the current shader-authoring semantics where they are valuable: explicit declarations in normal TypeScript and implicit declaration naming in `.shdr.ts` files.

## Problem

The current library mixes concerns across shallow seams:

- Fragment compilation and `fn(...)` independently build statement contexts and curate overlapping builtin APIs.
- Function definitions are embedded in expression nodes and collected in a later compiler walk rather than being owned by one program-construction phase.
- Uniforms have two representations: declarative schemas and legacy mutable maps. Compiler and runtime code branch on those representations.
- `runtime.ts` combines WebGL program setup, resource ownership, frame scheduling, resize and pointer handling, uniform adaptation, texture I/O, and cleanup.
- The Vite transform rewrites source naming but does not produce compiled shader artifacts; browser code still imports and executes authoring/compiler logic.
- The project has no automated tests, and important behavior is hidden behind browser/WebGL effects or duplicated glue.

The result is unnecessary navigation between files, weak locality for bugs, and a client bundle that cannot compile most authoring code away.

## Goals

1. Make a compiled shader artifact the boundary between authoring/compiler code and browser runtime code.
2. Ensure artifacts are strictly JSON-serializable: only plain objects, arrays, strings, numbers, booleans, and `null`.
3. Introduce a target-independent internal shader program IR, while implementing only a GLSL ES 3.00/WebGL target in this SOW.
4. Keep DSL authoring ergonomic:
   - normal `.ts` files use explicit `$.let(...)` / `$.const(...)`;
   - `.shdr.ts` files receive implicit naming with readable GLSL correspondence;
   - eligible `SCREAMING_SNAKE_CASE` fragment declarations become GLSL constants;
   - `_prefixed` variables remain JS-only escape hatches and compile away/in-line.
5. Preserve useful existing user-facing semantics unless a deliberate breaking change simplifies the architecture.
6. Make compiler validation and diagnostics local, deterministic, and testable.
7. Keep `createShader` as a simple self-running WebGL convenience API while internally separating runtime concerns.
8. Establish a thin, real Vite build-time artifact path and migrate examples as proof that compiler code leaves the client path.

## Non-Goals

- Implement WebGPU or WGSL emission.
- Implement visual shader inspection (`$.inspect(...)`).
- Redesign controls or example UX; they are integration consumers only.
- Build a complete test suite.
- Preserve `UniformMap`, `uniform.*`, or runtime `FragmentFn` compatibility overloads.
- Support arbitrary browser globals, side effects, or non-deterministic module evaluation in `.shdr.ts` authoring modules.
- Finalize exact syntax for declarative client runtime bindings.

## Architectural Direction

### 1. Program IR and compiler session

Replace the split fragment/function assembly paths with one internal program builder/session. It owns:

- symbols and naming;
- expressions and statements;
- function definitions and dependencies;
- uniform contract declarations;
- builtin signatures;
- source-location/diagnostic context.

`fn(...)`, fragment bodies, explicit `$.let`, implicit declarations, and constants contribute to the same program model. GLSL emission becomes a backend that lowers this model, rather than a concern distributed through proxy construction and callback wiring.

The program IR is internal and target-independent. It must not be shipped to the browser merely to render WebGL; the browser receives emitted target source plus runtime metadata.

### 2. Compiled shader artifact

The compiler/Vite path emits a plain-data artifact conceptually shaped like:

```ts
type CompiledShaderArtifact = {
  target: "glsl-es-300";
  fragment: string;
  uniforms: Record<string, UniformContract>;
  metadata: Record<string, unknown>;
};
```

The exact public names may change, but these rules are required:

- it is JSON-serializable and contains no functions, proxies, classes, DOM values, `File`, `Blob`, or WebGL objects;
- it includes the immutable uniform contract and serializable defaults/presentation metadata;
- it reserves extensible metadata for future features such as inspect views;
- it separates immutable artifact data from live client runtime state.

A Vite module may export this data as a JavaScript module, but the exported value itself must meet the JSON-serialization constraint.

### 3. Uniform contract and runtime state

Remove the legacy mutable `UniformMap` and `uniform.*` creation path. One schema/contract definition drives compiler declarations, artifact metadata, runtime handles, and controls.

`defineUniforms(...)` remains the single, co-located authoring declaration. Serializable values such as texture URL defaults remain valid:

```ts
u.texture2D("https://example.test/image.jpg", { accept: ["png", "jpeg"] });
```

Browser-only values such as `File` and `Blob` are supplied to live client handles, not embedded in artifacts. Client-derived defaults such as `devicePixelRatio` become explicit serializable runtime-binding descriptors rather than arbitrary expressions evaluated by the authored module. The exact API (`initial`, `scaleWith`, or equivalent) is a design detail for implementation.

`createShader` creates mutable runtime handles from the artifact contract. Existing control-oriented metadata such as label, ranges, step, and accepted texture extensions remains available from those handles.

### 4. Authoring and Vite pipeline

Normal `.ts` shader authoring remains explicit: `$.let(...)` and `$.const(...)` determine GLSL declarations directly.

`.shdr.ts` remains the ergonomic mode. Its build pipeline preserves current intended behavior:

- ordinary eligible declarations become named GLSL locals;
- eligible `SCREAMING_SNAKE_CASE` fragment declarations become GLSL constants;
- `fn(...)` names are inferred from bindings;
- `_prefixed` declarations remain untouched JS-only escape hatches;
- unsupported declaration/scope forms are diagnosed rather than silently surprising authors.

`.shdr.ts` is a build-evaluable authoring boundary. The compiler should reject or clearly diagnose browser globals, side effects, and imports that cannot be statically/build-time evaluated. Client-specific behavior belongs in declarative artifact bindings or the client runtime.

The SOW includes a Vite vertical slice that produces/imports an artifact and proves the browser path no longer imports DSL/compiler code. It need not solve every bundler or arbitrary evaluation pattern.

### 5. Compiler validation and diagnostics

The compiler owns semantic validation for the supported DSL surface, including:

- builtin signatures and argument/result types;
- valid swizzles;
- duplicate or invalid symbols;
- function call consistency and dependency cycles;
- uniform contract validity.

TypeScript remains useful author feedback, but compiler validation is authoritative for JavaScript callers, transforms, and generated artifacts. Diagnostics should preserve source locations through the `.shdr.ts` pipeline and remap generated GLSL/WebGL errors to source files/lines where feasible. Full source-map fidelity is not required.

### 6. WebGL runtime

Expose a WebGL-specific public entrypoint. The primary API consumes only a compiled artifact:

```ts
createShader({ canvas, shader: artifact });
```

It remains self-running and retains the familiar runtime shape:

- live `shader.u` uniform handles;
- animation-frame rendering;
- canvas resize and pointer uniforms;
- `destroy()` cleanup.

Internally, decompose the current runtime into focused units for WebGL program/resource management, uniform uploads, texture resources, canvas signals, and render scheduling. Do not make a lower-level manual-render API the primary interface in this SOW.

Texture handles expose observable asynchronous state through one general subscription mechanism:

```ts
type TextureStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; width: number; height: number }
  | { state: "error"; error: Error };

texture.onStatusChange((status) => {
  /* unsubscribe function returned */
});
```

This replaces hidden failure via `console.warn` as the only caller-visible behavior.

### 7. Public entrypoints

Formalize separate entrypoints:

- `shdr`: authoring/compiler API and types;
- `shdr/webgl`: browser WebGL runtime;
- `shdr/vite`: build integration.

Remove root-level `createShader` and remove primary runtime overloads that accept `FragmentFn` or raw GLSL. This keeps the client runtime boundary honest and prevents accidental compiler bundling.

## Acceptance Criteria

1. A `.shdr.ts` shader can be compiled by Vite into an artifact whose value is JSON-serializable.
2. A client imports the artifact and `createShader` from the WebGL entrypoint; it does not need the DSL compiler to render.
3. The artifact contains emitted GLSL, a uniform contract, serializable defaults/metadata, and an extensible metadata field.
4. Normal `.ts` fragments retain explicit `$.let`/`$.const`; `.shdr.ts` retains implicit naming and `_` escape semantics.
5. Existing example fragments are migrated to the artifact path. `src/controls.ts` continues to operate from runtime uniform handles without becoming library scope.
6. The sole uniform-definition model is schema/contract based; legacy `UniformMap` and `uniform.*` are deleted.
7. `createShader` retains automatic rendering, resize, pointer uniforms, mutable handles, and destruction while accepting artifacts only.
8. Texture load success/failure/loading is observable through a single status subscription API.
9. Compiler errors for supported semantic violations are clear and source-aware; invalid generated GLSL is not the first or only diagnostic for DSL mistakes.
10. Vitest covers the new boundary contracts: program/artifact emission, artifact serialization, uniform runtime handles, and mocked WebGL lifecycle/resource behavior.
11. `pnpm check`, build, and the migrated example application succeed.

## Suggested Implementation Phases

1. **Foundation:** introduce Vitest; characterize essential current compiler output and runtime lifecycle behavior.
2. **Compiler core:** create the program builder/IR, central builtin/signature registry, semantic validation, and GLSL emitter; migrate `fn` and fragment construction.
3. **Uniform simplification:** define one serializable contract model; remove legacy map APIs; add declarative client-runtime bindings and runtime-handle construction.
4. **Artifact boundary:** define/validate JSON artifact data; update compiler output and diagnostics metadata.
5. **Runtime decomposition:** split WebGL program, texture resource, uniform upload, canvas signals, and scheduling behind artifact-only `createShader`.
6. **Vite vertical slice:** integrate artifact compilation, preserve implicit naming, add diagnostics, and migrate examples plus controls imports.
7. **Boundary tests and cleanup:** add focused contract tests, remove obsolete exports/runtime compilation paths, and verify client bundles do not retain compiler code.

## Follow-Up Opportunities

These are intentionally outside this SOW:

- `createWebGlProgram({ fragment, contract })` as a deliberate low-level API for authored GLSL, rather than an overload on `createShader`.
- `$.inspect(...)` visual debug views using artifact metadata.
- WGSL emission and a `shdr/webgpu` runtime entrypoint.
- Targeted framework integration testing for Vite-based environments (for example, React Router and SvelteKit), including SSR/client-boundary behavior. This SOW validates vanilla Vite only.
- Additional build-tool integrations and richer source maps.
- A comprehensive test suite.
