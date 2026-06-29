# Implementation Plan: Implicit Naming Transform

See `implicit-naming-transform.md` for the full PRD and design rationale.

---

## Step 1 — Install dependencies and scaffold the plugin

**Work:**
- Install `oxc-parser` and `@babel/parser` as dev dependencies
  (`oxc-parser` is already transitively available via Vite 8 → rolldown, but
  declaring it explicitly pins the version and makes the dep explicit)
- Install `magic-string` if not already present (it's a Vite dep, but declare it)
- Create `src/vite-plugin-shdr.ts` with the Vite plugin shell and a no-op transform
- Register the plugin in `vite.config.ts`

```ts
// vite.config.ts
import { shdrPlugin } from "./src/vite-plugin-shdr";
export default defineConfig({ plugins: [shdrPlugin()] });
```

**Verify:**
- Dev server starts without errors
- A `console.log` inside the no-op `transformShdrSource` fires when a `.ts` file
  containing `compileFragment` is loaded

---

## Step 2 — Parser abstraction interface

**Work:**
- Define `ShdrParser` and `ParsedModule` interfaces in `src/transform/parser.ts`
- These are the only types the transform logic will depend on — no parser-specific
  types leak through

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

**Verify:**
- File compiles with `tsc --noEmit` — interface definitions only, no runtime code yet

---

## Step 3 — `oxc-parser` adapter (primary)

**Work:**
- Implement `OxcParser` in `src/transform/oxc-parser.ts`
- Use `oxc-parser`'s `parseSync` with `{ sourceType: "module", sourceFilename: id }`
- For `importsFrom`: use the top-level `staticImports` returned directly by
  `oxc-parser` — no AST walk needed
- For `arrowFnsTypedAs`: walk the AST looking for `VariableDeclaration` nodes
  where the type annotation's `typeName` matches (TS-ESTree format)
- For `callsTo` and `declarationsIn`: standard ESTree node walks

**Verify:**
- Write a standalone script that runs `OxcParser` against `src/fragments/gradient.ts`
- Confirm `importsFrom(/shdr/)` finds the shdr import
- Confirm `arrowFnsTypedAs("FragmentFn")` finds the `fragment` arrow function
- Confirm `callsTo("fn")` finds 0 calls (gradient.ts uses imported fns, not `fn()`)
- Run same script against `src/shader-utils.ts`
- Confirm `callsTo("fn")` finds 4 calls (`rot`, `hash`, `noise`, `filmGrain`)

---

## Step 4 — `@babel/parser` adapter (fallback)

**Work:**
- Implement `BabelParser` in `src/transform/babel-parser.ts`
- Uses `@babel/parser`'s `parse` with `{ sourceType: "module", plugins: ["typescript"] }`
- Implements the same `ParsedModule` interface as the oxc adapter
- For `importsFrom`: walk `ImportDeclaration` nodes
- For `arrowFnsTypedAs`: walk `VariableDeclaration` nodes checking
  `typeAnnotation.typeAnnotation.typeName.name`

**Verify:**
- Run the same test script from Step 3 but with `BabelParser` instead of `OxcParser`
- Results should be identical across both adapters for all four queries
- This confirms the abstraction layer is working correctly

---

## Step 5 — Boundary detection

**Work:**
- Implement `findFragmentBoundaries(module: ParsedModule)` in
  `src/transform/boundaries.ts`
- Detects all three `FragmentFn` patterns:
  1. `const f: FragmentFn = (...) => { ... }`
  2. `compileFragment((...) => { ... })`
  3. `createShader({ fragment: (...) => { ... } })`
- Detects `fn()` body callbacks by:
  1. Using `importsFrom(/shdr/)` to find the `fn` binding name
  2. Using `callsTo("fn")` to find calls to that specific binding
  3. Taking the last argument of each call as the body
- Returns `{ node: FunctionNode, kind: "fragment" | "fn-body" }[]`

**Verify:**
- Run against `src/fragments/gradient.ts` → 1 `fragment` boundary
- Run against `src/shader-utils.ts` → 4 `fn-body` boundaries
- Run against `src/main.ts` → 0 boundaries (no shader callbacks defined there)
- Run against a plain non-shader `.ts` file → 0 boundaries

---

## Step 6 — Declaration collection

**Work:**
- Implement `collectDeclarations(body: FunctionNode, module: ParsedModule)`
  in `src/transform/declarations.ts`
- Walks **top-level statements only** — no recursion into nested functions
- For each `VariableDeclaration`, records:
  - Binding name and casing (`camelCase`, `SCREAMING_CASE`, `_prefixed`)
  - Initialiser `start`/`end` offsets (for magic-string)
  - `skipLet`: true if initialiser is already `$.let(...)` or `$.const(...)`
  - `skipFnName`: true if this is a `fn(...)` call whose first arg is already a string
- Ignores destructuring patterns (`const { x } = ...`, `const [a] = ...`)

**Verify:**
- Run against the body of `gradient.ts`'s `fragment`:
  - `FILM_GRAIN_INTENSITY` → SCREAMING, skipLet: false
  - `COLOR_GREEN` → SCREAMING, skipLet: false
  - `aspectRatio` → camel, skipLet: false
  - `tuv0` → camel, skipLet: false
- Manually add `const tuv = $.let("tuv", ...)` and confirm skipLet: true
- Manually add `const _tmp = $.uv.x` and confirm casing: `_prefixed`

---

## Step 7 — Source rewriting with `magic-string`

**Work:**
- Implement `rewriteDeclarations(s: MagicString, declarations: Declaration[])`
  in `src/transform/rewrite.ts`
- For each declaration with `skipLet: false`:
  - `camelCase` initialiser at offsets `[start, end]`:
    prepend `$.let("name", ` before `start`, append `)` after `end`
  - `SCREAMING_CASE`: same but `$.const("NAME", ...)`
  - `_prefixed`: no-op
- For `fn(...)` calls with `skipFnName: false`:
  prepend `"name", ` immediately after the opening `(` of the call

**Verify:**
- Run the full pipeline on `src/shader-utils.ts` (no explicit `$.let` calls)
- Print transformed source and confirm:
  - `const s = sin(a)` → `const s = $.let("s", sin(a))`
  - `const rot = fn([Float], ...)` → `const rot = fn("rot", [Float], ...)`
- Confirm the file on disk is unchanged (transform is in-memory only)

---

## Step 8 — Source maps

**Work:**
- Return `{ code: s.toString(), map: s.generateMap({ hires: true }) }` from the
  Vite transform hook

**Verify:**
- Open browser devtools → Sources panel
- Set a breakpoint inside a transformed fragment callback
- Confirm the breakpoint resolves to the original source line, not the rewritten form

---

## Step 9 — Wire into the dev server and smoke test

**Work:**
- Connect all steps in `transformShdrSource(code, id)`
- Add the early-exit guard:
  ```ts
  if (!code.includes("FragmentFn") &&
      !code.includes("compileFragment") &&
      !code.includes("createShader") &&
      !code.includes(" fn(")) return;
  ```
- Remove all explicit `$.let`, `$.const`, and name-string calls from
  `src/fragments/palette.ts` (the simplest fragment — a good first target)

**Verify:**
- Dev server starts, palette shader renders correctly
- `compileFragment(fragment)` output is identical to the pre-transform version
- Breakpoints still resolve to original source

---

## Step 10 — Apply to all remaining shader files

**Work:**
- Remove explicit boilerplate from:
  - `src/shader-utils.ts`
  - `src/fragments/gradient.ts`
  - `src/fragments/circles.ts`

**Verify:**
- All three shaders render correctly when toggled in `main.ts`
- GLSL output is identical to pre-transform for each

---

## Step 11 — HMR verification

**Work:**
- No code changes — manual verification only

**Verify:**
- With dev server running, edit a value in a fragment file (e.g. change
  `ROTATION_SPEED = 0.15` to `ROTATION_SPEED = 0.5`)
- Shader hot-reloads and the change is visible without a full page refresh
- No stale transform artifacts appear

---

## File layout

```
src/
  vite-plugin-shdr.ts          ← Vite plugin entry point
  transform/
    parser.ts                  ← ShdrParser / ParsedModule interface
    oxc-parser.ts              ← oxc-parser adapter (default)
    babel-parser.ts            ← @babel/parser adapter (fallback)
    boundaries.ts              ← findFragmentBoundaries()
    declarations.ts            ← collectDeclarations()
    rewrite.ts                 ← rewriteDeclarations() via magic-string
    index.ts                   ← transformShdrSource() — wires everything together
```
