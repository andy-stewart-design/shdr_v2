# Implementation Plan: Compiler Artifacts and Deep Library Boundaries

Companion to [`architectural-deepening-prd.md`](./architectural-deepening-prd.md).

## Delivery Principles

- Each phase lands as a coherent, buildable change. `pnpm check` and `pnpm build` must pass after every phase.
- New behavior receives Vitest coverage where it is deterministic; browser/WebGL integration is verified with a documented manual smoke test where mocking would not prove the behavior.
- Do not retain compatibility shims that require the WebGL runtime to import compiler/DSL code.
- Keep the existing fragment output visually stable unless a phase explicitly changes behavior.
- Use the example sketches and `src/controls.ts` as integration consumers, not as places to relocate library complexity.

## Phase 0 — Test Harness and Behavioral Baseline

### Scope

Add Vitest and a small set of characterization tests around current behavior that must survive the refactor:

- GLSL emitted for representative fragment expressions, named locals/constants, functions, and uniforms;
- uniform handle dirty/value-copy semantics;
- compiler errors currently guaranteed by the public API.

Add a lightweight WebGL2 mock/fake only for the observable calls needed by runtime lifecycle tests; do not reproduce WebGL in tests.

### Verification

- `pnpm test` executes in CI/local development.
- Tests compile at least one fragment with a function dependency, a texture uniform, explicit `$.let`, and explicit `$.const`.
- Tests establish expected copy/dirty behavior for float, vector, and texture values.
- `pnpm check`, `pnpm test`, and `pnpm build` pass.

### Falsifiable success criteria

This phase fails if the project has no repeatable test command, if compiler output cannot be asserted without a browser, or if the baseline test suite is flaky.

---

## Phase 1 — Canonical Program Model and GLSL Emitter

### Scope

Introduce an internal, target-independent shader program IR and one program-builder/session that owns expression creation, statements, symbols, function definitions, dependencies, and source context.

Migrate fragment construction and `fn(...)` construction onto that session. Keep the current DSL surface and GLSL ES 3.00 output behavior. Move GLSL string generation into a dedicated emitter that consumes the IR.

Proxies remain the author-facing expression façade, but proxy handlers delegate to the program builder rather than independently owning AST/compiler behavior.

### Verification

- Unit tests compile representative fragments/functions through the new program model and compare emitted GLSL with approved output snapshots or semantic assertions.
- Tests prove dependencies are emitted before callers and circular function dependencies fail deterministically.
- Existing sketches render manually without visual regressions.

### Falsifiable success criteria

This phase fails if `compileFragment` and `fn(...)` still have separate statement-building implementations, if function dependency discovery depends on embedded opaque definition objects in expression nodes, or if existing representative shaders no longer emit valid WebGL2 GLSL.

---

## Phase 2 — Central Semantic Validation and Diagnostics

### Scope

Create one builtin/signature registry used by authoring types, program construction, semantic validation, and GLSL lowering. Validate supported DSL semantics in the compiler:

- builtin arity and operand/result types;
- swizzle legality;
- local/constant/function symbol conflicts;
- function call consistency and cycles;
- uniform declaration validity.

Retain TypeScript types as early feedback, but make runtime/compiler diagnostics clear for JavaScript callers and transformed source. Establish an internal diagnostic shape capable of carrying a source location.

### Verification

- Vitest cases construct invalid programs at runtime and assert precise diagnostic messages/categories.
- Valid representative programs continue to compile.
- At least one invalid swizzle, invalid builtin call, duplicate symbol, and cycle has a deterministic compiler error rather than a generated-GLSL/WebGL failure.

### Falsifiable success criteria

This phase fails if an invalid supported DSL operation reaches GLSL emission without a compiler diagnostic, or if builtin behavior remains separately hard-coded in proxy handlers, fragment contexts, and function contexts.

---

## Phase 3 — One Serializable Uniform Contract

### Scope

Replace `UniformSchema` plus legacy `UniformMap`/`uniform.*` with one declarative uniform contract model. It must represent shader type, serializable default, UI metadata, and declarative client-runtime bindings while separating mutable client values from artifact data.

Keep `defineUniforms(...)` as the co-located authoring API. Preserve URL texture defaults and metadata. Design and implement the selected declarative form for client-derived initialization (such as device-pixel-ratio scaling). Remove legacy map types, factories, discriminators, and overloads.

### Verification

- Unit tests assert contracts are JSON-serializable and reject `File`/`Blob` defaults.
- Tests assert URLs, numeric/vector defaults, labels, ranges, steps, and texture accept metadata survive contract construction.
- Tests assert a client-runtime binding resolves from supplied runtime environment data, rather than evaluating browser globals in the authoring module.
- Update the pixelation example away from direct `devicePixelRatio` use in its schema.

### Falsifiable success criteria

This phase fails if compiler or runtime branches on legacy `kind` versus schema `type`, if a `File`/`Blob` can enter the compiled contract, or if a client-derived default requires evaluating a `.shdr.ts` module in the browser.

---

## Phase 4 — Compiled Artifact Contract

### Scope

Define the public compiled artifact and compile authoring programs into it. The artifact contains:

```ts
{
  target: "glsl-es-300",
  fragment: string,
  uniforms: Record<string, UniformContract>,
  metadata: Record<string, unknown>,
}
```

Make serialization validation explicit. Preserve an extensible metadata object but do not implement inspect views. Retain a string-returning compiler helper only if useful for authoring/debugging; the canonical compiler result is the artifact.

### Verification

- Artifact tests use `JSON.stringify`/`JSON.parse` and deep equality to prove lossless serialization.
- Tests assert no function, proxy, class instance, DOM object, `File`, or `Blob` is present recursively.
- GLSL from `artifact.fragment` compiles in the existing WebGL2 smoke path.
- Uniform declarations in emitted GLSL correspond exactly to the artifact contract.

### Falsifiable success criteria

This phase fails if a browser-only runtime value is embedded in an artifact, if rehydrated artifact data cannot render equivalently, or if artifact metadata is required to contain compiler implementation objects.

---

## Phase 5 — Artifact-Only WebGL Runtime and Resource Decomposition

### Scope

Split the current runtime internally into focused components, for example:

- WebGL shader/program creation and deletion;
- artifact-contract-to-live-uniform-handle construction;
- scalar/vector uniform upload;
- asynchronous texture resource loading/binding;
- canvas resize and pointer input;
- frame scheduling and lifecycle facade.

Expose `createShader({ canvas, shader: artifact })` from `shdr/webgl`. Preserve automatic animation, resize/pointer uniforms, live `shader.u`, and `destroy()`. Remove `FragmentFn` and raw-GLSL overloads from the primary runtime API.

Add observable texture status with one subscription API and an unsubscribe return value.

### Verification

- Mocked-WebGL tests assert compilation/linking, uniform upload, draw, and cleanup calls for an artifact.
- Texture-handle tests assert `loading → ready` and `loading → error` status transitions, listener delivery, and unsubscribe behavior.
- Tests assert client-provided `File`/`Blob` values can be set on a live texture handle without appearing in the artifact.
- Manual smoke test: each existing sketch renders, resizing updates dimensions, pointer uniforms update, and `destroy()` stops rendering/releases resources.

### Falsifiable success criteria

This phase fails if `shdr/webgl` imports the compiler/proxy/authoring implementation, if `createShader` accepts a DSL callback or raw GLSL, if texture errors remain observable only through `console.warn`, or if `destroy()` leaves scheduled frames/listeners alive.

---

## Phase 6 — Entrypoints and Vite Artifact Pipeline

### Scope

Formalize entrypoints:

- `shdr` for authoring/compiler APIs;
- `shdr/webgl` for the artifact-only browser runtime;
- `shdr/vite` for Vite integration.

Extend the Vite path from syntax rewriting to artifact production. Preserve `.shdr.ts` implicit naming conventions:

- normal eligible declarations become GLSL locals;
- eligible `SCREAMING_SNAKE_CASE` fragment declarations become GLSL constants;
- inferred `fn(...)` binding names work;
- `_prefixed` declarations remain JS-only/inlined;
- unsupported declarations/scopes produce actionable diagnostics.

Constrain `.shdr.ts` to deterministic build-safe authoring code. Diagnose browser globals, effects, and non-evaluable imports. Preserve source locations through transforms sufficiently to report author-file locations for transform/compiler/GLSL errors.

### Verification

- A vanilla Vite fixture imports a `.shdr.ts` artifact and renders it through `shdr/webgl`.
- Inspect the production bundle (via manifest/stats or an equivalent repeatable check) to show the client entry does not include compiler/proxy modules.
- Fixture coverage includes implicit local names, implicit constants, inferred function names, and `_prefixed` escape variables.
- Invalid `.shdr.ts` declaration forms and browser-global use produce diagnostics naming the source file and line.
- Manual Vite dev/build/preview smoke test renders migrated sketches.

### Falsifiable success criteria

This phase fails if the Vite fixture still calls the compiler in the browser, if implicit naming behavior changes silently, if a build-unsafe `.shdr.ts` module succeeds with browser-dependent output, or if diagnostics only identify generated GLSL locations.

---

## Phase 7 — Consumer Migration, Deletion, and Boundary Audit

### Scope

Migrate all `src/fragments` sketches to export/import compiled artifacts and use the WebGL entrypoint. Update `src/controls.ts` only as required to consume live handles from the new contract/runtime model; do not redesign controls.

Delete obsolete compiler/runtime compatibility paths, legacy uniform code, root runtime exports, and dead transform/compiler glue. Document the new authoring/runtime/Vite boundaries and migration examples.

Perform a final boundary audit focused on client bundling and module ownership.

### Verification

- Every sketch works through the artifact path in vanilla Vite.
- Controls retain float and texture editing/upload behavior and can observe texture status if needed.
- Repository search confirms no production client path imports `compileFragment`, proxy/AST internals, or authoring-only entrypoints to render a shader.
- `pnpm check`, `pnpm test`, `pnpm build`, and Vite preview smoke tests pass.

### Falsifiable success criteria

This phase fails if any example relies on runtime compilation, if legacy uniform/runtime overload code remains reachable from public APIs, or if a production rendering bundle includes compiler/DSL implementation modules.

## Deferred Work

Do not fold these into the phases above:

- `createWebGlProgram({ fragment, contract })` for deliberately authored raw GLSL;
- `$.inspect(...)` artifact metadata and visual debugging;
- WGSL/WebGPU lowering and `shdr/webgpu`;
- framework-specific Vite integration tests (React Router, SvelteKit, including SSR/client boundaries);
- a broad test-suite expansion beyond the boundary contracts introduced here.
