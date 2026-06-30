# Revised Implementation Plan: Implicit Naming Transform

This is a revised, MVP-focused version of the implicit naming transform plan. It keeps the core ergonomics from the PRD, but reduces implementation risk by narrowing the first pass to one parser, one transform path, and explicit fallback behavior.

## Goal

Let shader authors write normal-looking TypeScript inside shader callbacks:

```ts
const tuv = $.uv.sub(0.5);
const WAVE_SPEED = 2.0;
const rot = fn([Float], Mat2, ([a], { sin, cos, mat2 }) => {
  const s = sin(a);
  const c = cos(a);
  return mat2(c, s.neg(), s, c);
});
```

and have the Vite transform rewrite it in memory to the explicit DSL form:

```ts
const tuv = $.let("tuv", $.uv.sub(0.5));
const WAVE_SPEED = $.const("WAVE_SPEED", 2.0);
const rot = fn("rot", [Float], Mat2, ([a], { sin, cos, mat2 }) => {
  const s = $.let("s", sin(a));
  const c = $.let("c", cos(a));
  return mat2(c, s.neg(), s, c);
});
```

The user's source files are never modified. Rewrites happen only in Vite's transform pipeline.

---

## MVP Scope

Implement only Phase 1 ergonomics:

1. Variable declaration wrapping inside shader fragment bodies:
   - `camelCase` → `$.let("name", expr)`
   - `SCREAMING_CASE` → `$.const("NAME", expr)`
   - `_prefixed` → untouched

2. Variable declaration wrapping inside `fn()` body callbacks:
   - `camelCase` → `$.let("name", expr)`
   - `SCREAMING_CASE` → untouched/inlined, because `FnContext` has no `$.const`
   - `_prefixed` → untouched

3. `fn()` name inference:
   - `const rot = fn([Float], Mat2, body)` → `const rot = fn("rot", [Float], Mat2, body)`

Do **not** implement schema-free `fn` in this pass.

---

## Non-Goals for MVP

- No schema-free `fn<Args, Return>(...)` transform.
- No parser abstraction layer yet.
- No dual parser support yet.
- No auto-transforming nested arbitrary callbacks.
- No source-file rewriting or code generation.
- No transformation of destructuring declarations.
- No transformation of multiple declarators in one statement for the first pass.

---

## Key Design Decisions

### Use one parser first

Start with `oxc-parser` only.

Reasoning:

- The transform itself is the risky part.
- Supporting both `oxc-parser` and `@babel/parser` from day one doubles AST handling complexity.
- We can add a parser abstraction later once behavior is proven.

If `oxc-parser` turns out painful in practice, switch to `@babel/parser`; do not support both until the MVP works.

### Explicit style remains valid

The transform must skip declarations already written explicitly:

```ts
const tuv = $.let("tuv", $.uv.sub(0.5));
const COLOR = $.const("COLOR", vec3(1.0));
const rot = fn("rot", [Float], Mat2, body);
```

This allows gradual migration and gives users an escape hatch.

### Top-level declarations only

Only transform declarations directly inside:

- a `FragmentFn` callback body
- a `fn()` body callback

Do not descend into nested functions, array callbacks, event handlers, or arbitrary closures.

### `_prefixed` is the escape hatch

Any top-level declaration inside shader callbacks that should remain plain JavaScript must be prefixed with `_`:

```ts
const _scale = 30.0;
const distX = sin(tuv.y.mul(WAVE_FREQ)).div(_scale);
```

This should be documented clearly because it is the main semantic rule users need to learn.

---

## File opt-in convention

Implicit naming changes normal TypeScript semantics, so the transform should only run for files explicitly marked as shader-transform files:

```txt
*.shdr.ts
*.shdr.tsx
```

Recommended layout:

```txt
fragment.shdr.ts  # transformed shader DSL code
index.ts          # normal TS barrel/setup file
```

Explicit DSL style continues to work in normal `.ts` files, but implicit declaration rewriting requires the `.shdr.ts` suffix.

---

## Step 1 — Install dependencies and scaffold Vite plugin

### Work

Install explicit dependencies:

```bash
pnpm add -D oxc-parser magic-string
```

Create:

```txt
src/vite-plugin-shdr.ts
src/transform/index.ts
```

Add a no-op Vite plugin:

```ts
export function shdrPlugin() {
  return {
    name: "shdr-transform",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!/\.shdr\.tsx?$/.test(id)) return null;
      return transformShdrSource(code, id);
    },
  };
}
```

Register in `vite.config.ts`.

### Verify

- Dev server starts.
- No-op transform runs for `.ts` shader files.
- `pnpm check` passes.

---

## Step 2 — Parse with `oxc-parser`

### Work

Create:

```txt
src/transform/parse.ts
```

Implement a small parse helper:

```ts
export function parseModule(code: string, id: string) {
  return parseSync(code, {
    sourceType: "module",
    sourceFilename: id,
  });
}
```

Also create a tiny AST walker utility rather than introducing a large traversal dependency.

### Verify

Run a temporary script or unit-style debug function against:

- `src/fragments/ben-day-spotlight/index.ts`
- `src/fragments/moby-gradient/utils.ts`
- `src/fragments/pixelation/index.ts`

Confirm the parser returns usable `start`/`end` offsets for declarations and call expressions.

---

## Step 3 — Import binding detection

### Work

Detect imports from local shdr entry points and track the imported binding names for:

- `fn`
- `FragmentFn`
- `compileFragment`
- `createShader`

Examples:

```ts
import { fn } from "../../shdr/index.ts";
import { fn as shaderFn } from "../../shdr/index.ts";
import type { FragmentFn } from "../../shdr/index.ts";
```

The transform should use the local binding name, not the imported name alone.

### Verify

- `fn as shaderFn` is detected correctly.
- Non-shdr functions named `fn` are ignored.
- Type-only `FragmentFn` imports are detected if present in AST import metadata.

---

## Step 4 — Boundary detection

### Work

Find shader transform boundaries:

#### Fragment boundaries

Support initially:

```ts
const fragment: FragmentFn = ({ $ }) => { ... };
const fragment: FragmentFn<typeof uniforms> = ({ $ }) => { ... };
```

Optionally support direct call sites after this works:

```ts
compileFragment(({ $ }) => { ... });
createShader({ fragment: ({ $ }) => { ... } });
```

#### `fn()` body boundaries

For calls to the tracked `fn` binding:

```ts
const rot = fn([Float], Mat2, ([a], ctx) => { ... });
const noise = fn("noise", [Vec2], Float, ([p], ctx) => { ... });
```

The body callback is the last argument.

### Verify

- Pixelation fragment: one fragment boundary.
- Moby gradient utils: multiple `fn-body` boundaries.
- `main.ts`: no boundaries unless inline fragment callbacks are added.
- Non-shader files: no boundaries.

---

## Step 5 — Declaration collection

### Work

For each boundary body, inspect top-level statements only.

Collect declarations that are safe to transform:

```ts
const name = initializer;
let name = initializer;
```

Skip:

- destructuring declarations
- declarations without initializers
- multiple declarators in one declaration statement
- declarations whose initializer is already `$.let(...)`
- declarations whose initializer is already `$.const(...)`
- `_prefixed` names

Classify identifier casing:

```ts
camelCase      -> local let candidate
SCREAMING_CASE -> top-level GLSL const candidate in fragments only
_prefixed      -> escape hatch / untouched
```

Suggested initial casing helpers:

```ts
const isPrivate = name.startsWith("_");
const isScreaming = /^[A-Z][A-Z0-9_]*$/.test(name);
const isIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
```

### Verify

Against `ben-day-spotlight`:

- `SPREAD_FACTOR` → fragment const candidate
- `uv0` → let candidate
- `_foo` if manually added → skipped
- `const { dpi } = $.u` → skipped because destructuring

Against `moby-gradient/utils.ts`:

- `s` and `c` inside `rot` → fn local let candidates
- screaming names inside fn body → skipped/untouched

---

## Step 6 — `fn()` name inference collection

### Work

Find variable declarations where the initializer is a call to the tracked `fn` binding.

If the first argument is not a string literal, inject the binding name:

```ts
const rot = fn([Float], Mat2, body);
//          ^^ insert "rot", after opening paren
```

Skip if already explicit:

```ts
const rot = fn("rot", [Float], Mat2, body);
```

Skip if declaration is destructured or not a simple identifier.

### Verify

- `const rot = fn([Float], ...)` rewrites to `fn("rot", [Float], ...)`.
- `const rot = fn("rot", [Float], ...)` is unchanged.
- Imported alias `shaderFn` is handled if `fn` was imported as `shaderFn`.

---

## Step 7 — Source rewriting with `magic-string`

### Work

Use AST `start`/`end` offsets to rewrite only initializer expressions or call argument lists.

For fragment declarations:

```ts
const uv = $.uv.sub(0.5);
```

rewrite initializer to:

```ts
$.let("uv", $.uv.sub(0.5))
```

For fragment screaming-case declarations:

```ts
const COLOR = vec3(1.0);
```

rewrite initializer to:

```ts
$.const("COLOR", vec3(1.0))
```

For `fn()` body declarations:

```ts
const s = sin(a);
```

rewrite initializer to:

```ts
$.let("s", sin(a))
```

For `fn()` name inference:

```ts
fn([Float], Mat2, body)
```

insert:

```ts
fn("rot", [Float], Mat2, body)
```

### Important ordering

Collect all edits first, then apply with `magic-string`.

Avoid overlapping edits:

- wrapping an initializer and injecting a `fn` name in the same initializer can overlap if not handled carefully
- if overlap occurs, either skip the lower-priority edit or merge explicitly

### Verify

Print transformed source for one fragment and one utils file.

Confirm:

- source formatting outside edited expressions is preserved
- source files on disk are unchanged
- transformed code typechecks when copied manually into a temp file if needed

---

## Step 8 — Return source maps

### Work

Vite transform should return:

```ts
return {
  code: s.toString(),
  map: s.generateMap({ hires: true, source: id }),
};
```

If no edits were made, return `null`.

### Verify

- Browser devtools show original source lines.
- Breakpoints in fragment files resolve to original code.

---

## Step 9 — Smoke test on one fragment

### Work

Pick one simple fragment and migrate it to implicit style in a `.shdr.ts` file.

Suggested first target:

```txt
src/fragments/ben-day-spotlight/fragment.shdr.ts
```

Do not migrate all shaders yet.

### Verify

- Dev server renders the same visual output.
- `console.log(compileFragment(fragment, { uniforms }))` produces equivalent readable GLSL.
- HMR still works when editing the fragment.
- Existing explicit-style fragments still work.

---

## Step 10 — Smoke test on one `fn` utils file

### Work

Migrate a small part of:

```txt
src/fragments/moby-gradient/utils.ts
```

Suggested first change:

```ts
export const rot = fn([Float], Mat2, ([a], { sin, cos, mat2 }) => {
  const s = sin(a);
  const c = cos(a);
  return mat2(c, s.neg(), s, c);
});
```

### Verify

- `fn` name is inferred as `"rot"`.
- `s` and `c` are emitted as GLSL local variables.
- `compileFn(rot)` still emits valid GLSL.
- Dependent fragments still render.

---

## Step 11 — Gradual migration

Only after Steps 9–10 are stable, migrate additional files one by one.

Suggested order:

1. `ben-day-spotlight`
2. `pixelation`
3. `moby-gradient/utils.ts`
4. `moby-gradient/index.ts`
5. `circles`
6. `horizon-burn`

After each file:

- run `pnpm check`
- run dev server
- compare GLSL output where practical

---

## Step 12 — HMR verification

### Work

Manual verification only.

### Verify

- Start dev server.
- Edit a value in a transformed fragment.
- Shader updates without full reload.
- No duplicate wrapping appears after repeated saves.
- Explicit `$.let(...)` declarations remain unchanged.

---

## Edge Cases to Handle Explicitly

### Multiple declarators

```ts
const a = foo(), b = bar();
```

MVP behavior: skip the whole declaration and optionally warn in dev.

Reason: independent edits are possible, but this adds complexity and shader code should prefer one declaration per line.

### Destructuring

```ts
const { dpi } = $.u;
```

MVP behavior: skip.

### Non-shader values

```ts
const options = { debug: true };
```

MVP behavior: this would be transformed unless prefixed:

```ts
const _options = { debug: true };
```

Document this clearly.

### `SCREAMING_CASE` in `fn()` bodies

MVP behavior: leave untouched.

Reason: `FnContext` does not expose `$.const`, and function-local GLSL constants are not essential for readability.

### Imported aliases

```ts
import { fn as shaderFn } from "../../shdr";
const rot = shaderFn([Float], Mat2, body);
```

MVP should support this if import binding tracking is already implemented. If it complicates the first pass, document it as unsupported and require direct `fn` import initially.

---

## Suggested File Layout

```txt
src/
  vite-plugin-shdr.ts
  transform/
    index.ts          # transformShdrSource()
    parse.ts          # oxc parse helper
    walk.ts           # small AST walker
    imports.ts        # shdr import binding detection
    boundaries.ts     # fragment/fn body detection
    declarations.ts   # declaration classification
    rewrite.ts        # magic-string rewrites
```

Parser abstraction and Babel fallback can be added later if needed.

---

## Future Work

### Parser abstraction and Babel fallback

Once behavior is stable, introduce:

```ts
interface ShdrParser {
  parse(code: string, id: string): ParsedModule;
}
```

Then add `@babel/parser` fallback if supporting non-Vite-8 environments matters.

### Schema-free `fn`

Defer until Phase 1 is stable.

Potential future syntax:

```ts
interface RotArgs { a: Float }
const rot = fn<RotArgs, Mat2>(({ a }, ctx) => { ... });
```

This requires reading TypeScript type declarations from the AST and injecting runtime schemas.

### Better diagnostics

Eventually provide dev warnings for skipped declarations:

- multiple declarators
- destructuring
- unsupported aliases
- declarations that look like accidental non-shader values

---

## Why this revision differs from the original plan

- Uses one parser first instead of building an abstraction plus two adapters up front.
- Treats parser fallback as future work rather than MVP work.
- Makes top-level-only traversal and skip behavior stricter for the first pass.
- Explicitly skips multiple declarators in MVP.
- Promotes gradual migration: prove one fragment and one `fn` utils file before changing all shaders.
- Calls out `_prefixed` as the main semantic escape hatch users must learn.
