# PRD: Implicit Naming Transform (Vite Plugin)

## Problem

The DSL currently requires explicit names to produce readable GLSL output:

```ts
const tuv   = $.let("tuv",   $.uv.sub(0.5));
const distX = $.let("distX", sin(tuv.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP));
```

The name appears twice — once for JS, once for GLSL — which is redundant noise.
`fn()` also requires an explicit name string as its first argument:

```ts
const rot = fn("rot", [Float], Mat2, ([a], { sin, cos, mat2 }) => { ... });
```

The goal is that users write simpler, cleaner code and the transform handles the ceremony invisibly — exactly like the Svelte compiler. The user's source files are never modified; rewrites happen only in Vite's transform pipeline.

```ts
// What the user writes
const tuv   = $.uv.sub(0.5);
const distX = sin(tuv.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP);
const rot   = fn([Float], Mat2, ([a], { sin, cos, mat2 }) => { ... });

// What the transform emits (user never sees this)
const tuv   = $.let("tuv",   $.uv.sub(0.5));
const distX = $.let("distX", sin(tuv.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP));
const rot   = fn("rot", [Float], Mat2, ([a], { sin, cos, mat2 }) => { ... });
```

---

## Phase 1 — Variable naming + fn name inference

### Naming conventions

JS identifier casing is the sole signal. The JS keyword (`const` vs `let`) is ignored — both are treated identically.

| JS name | Transform injects | GLSL output |
|---|---|---|
| `camelCase` | `$.let("name", expr)` | `float name = ...;` inside `main()` |
| `SCREAMING_CASE` | `$.const("NAME", expr)` | `const float NAME = ...;` above `main()` |
| `_camelCase` | nothing — left as-is | inlined wherever used |

`_camelCase` is the escape hatch for:
1. Intermediate expressions named for readability but not needed in GLSL output
2. Plain JS values inside the callback that aren't shader expressions

```ts
const _scale = 30.0;                                    // not touched
const distX  = sin(tuv.y.mul(WAVE_FREQ)).div(_scale);   // _scale inlined
```

`SCREAMING_CASE` inside `fn()` bodies is treated as `_camelCase` (inline), since
`$.const` does not exist in `FnContext`. The distinction between GLSL constant and
inline literal matters less inside a function body.

### fn name inference

When a `fn()` call has no string as its first argument, the transform injects the
name from the JS binding:

```ts
// Input
const rot = fn([Float], Mat2, body);

// Output
const rot = fn("rot", [Float], Mat2, body);
```

Detection: if the first argument is not a `StringLiteral`, inject `"bindingName"`
as a new first argument.

### Backward compatibility

The transform is per-declaration, not per-file. Each declaration is evaluated
independently:

- If the initialiser is already `$.let(...)` or `$.const(...)` — skip it
- If the `fn()` first argument is already a string — skip it

This means explicit and implicit styles can be freely mixed in the same callback.
Existing code works unchanged without opt-in.

### Boundaries

The transform operates inside:
- `FragmentFn` bodies — detected by type annotation (`const f: FragmentFn = ...`)
  or call site (`compileFragment(...)`, `createShader({ fragment: ... })`)
- `fn()` body callbacks — the last argument of any call to the `fn` binding
  imported from shdr

It does **not** descend into any other nested function — no array method callbacks,
no plain arrow functions, nothing that isn't typed as `FragmentFn` or `FnContext`.

For `fn()` detection specifically, the transform tracks the import binding rather
than trusting the name alone:

```ts
import { fn } from "./shdr/index.ts";  // ← tracked
```

Only calls to this specific binding are treated as shader fn bodies, preventing
false positives on user code that coincidentally names something `fn`.

---

## Phase 2 — Schema-free fn (future)

Eliminate the runtime params array by reading TypeScript interface definitions:

```ts
// What the user writes
interface RotArgs { a: Float }
const rot = fn<RotArgs, Mat2>(([a], { sin, cos, mat2 }) => { ... });

// What the transform emits
const rot = fn("rot", [Float], Mat2, ([a], { sin, cos, mat2 }) => { ... });
```

This requires the transform to read a TypeScript interface from the AST and map
its fields to GLSL type tokens — significantly more complex than Phase 1, which
is purely syntactic. Deferred until Phase 1 is stable.

---

## Technical design

### The transform is invisible

This is not a code generator or scaffolding tool. The user's source files on disk
are never modified. Rewrites happen only in Vite's in-memory transform pipeline,
exactly like the Svelte compiler or Vue `<script setup>`.

### Parser: `oxc-parser` with abstraction layer

`acorn` (Vite's bundled parser) is a non-starter: it does not support TypeScript
and strips type annotations. Since boundary detection requires reading
`const fragment: FragmentFn = ...` type annotations, TypeScript parsing is required.

**`oxc-parser` is the default adapter.** Reasons:
- Already transitively available via Vite 8 → rolldown (no extra install needed)
- Full TypeScript support via TS-ESTree format
- Returns static import info directly (`staticImports`) without walking the AST
- Explicitly designed for use alongside `magic-string` for source rewrites
- ESTree-compatible AST minimises adapter surface area

**`@babel/parser` is the fallback** for projects on Vite < 8. Both adapters ship
together behind a thin interface — neither is optional:

```ts
interface ShdrParser {
  parse(code: string, id: string): ParsedModule;
}

interface ParsedModule {
  importsFrom(pattern: RegExp): ImportedBinding[];
  arrowFnsTypedAs(typeName: string): FunctionNode[];
  callsTo(name: string): CallNode[];
  declarationsIn(node: FunctionNode): Declaration[];
}
```

The transform logic is written against `ParsedModule` only. Swapping parsers
is a one-line change at the plugin entry point.

### Source rewriting: `magic-string`

Node `start`/`end` offsets from the AST are used to splice insertions into the
original source string via `magic-string` (a Vite dependency). This preserves all
formatting outside rewritten nodes and automatically generates source maps so
debugger breakpoints point to the original source.

---

## Risks and edge cases

- **Destructuring** — `const { x, y } = someVec` should be ignored, not rewritten.
  Detect `ObjectPattern`/`ArrayPattern` on the left side and skip.
- **HMR** — the transform runs on every file change, so HMR works naturally.
  Verify that the Vite module graph correctly invalidates when shader files change.
- **Non-shader `const`s inside callbacks** — use `_camelCase` as the escape hatch.
  The type system catches any accidental wrapping of non-shader values in `$.let`.

---

## Prior art

- **Svelte compiler** — the direct conceptual ancestor
- **Vue `<script setup>`** — same pattern: `const x = ref(0)` becomes reactive at build time
- **SolidJS** — JSX transform injects fine-grained reactivity
