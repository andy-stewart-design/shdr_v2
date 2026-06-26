# PRD: Implicit Variable Naming via Compile-Time Transform

## Problem

The DSL currently requires explicit names to produce readable GLSL output:

```ts
const tuv   = $.let("tuv",   $.uv.sub(0.5));
const distX = $.let("distX", sin(tuv.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP));
```

Without `$.let`, variables are inlined and the output becomes a single unreadable expression. The name `"tuv"` has to be written twice — once for JS, once for GLSL — which is redundant and noisy.

The ideal is that this simpler form:

```ts
const tuv   = $.uv.sub(0.5);
const distX = sin(tuv.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP);
```

…produces the same readable GLSL as the verbose form. The variable names already exist in the source — they're just erased before runtime.

## Approach

A **Vite plugin** (or Babel/TS transform) that rewrites the source before it executes, injecting `$.let` / `$.const` calls using the JS variable names it finds in the AST.

### Transform rule

Inside a `compileFragment(...)` or `createShader({ fragment: ... })` callback, every `const` declaration whose initializer is a shader expression gets rewritten:

```ts
// Input
const tuv = $.uv.sub(0.5);

// Output
const tuv = $.let("tuv", $.uv.sub(0.5));
```

### Naming heuristic

| JS variable name | Emitted as | GLSL output |
|---|---|---|
| `camelCase` | `$.let("name", expr)` | `float/vec* name = ...;` inside `main()` |
| `SCREAMING_SNAKE_CASE` | `$.const("NAME", expr)` | `const float/vec* NAME = ...;` above `main()` |

This mirrors the convention already used in the DSL by hand.

### Detection strategy

The transform needs to know which `const` declarations inside the callback are shader expressions vs plain JS values. Two options:

1. **Transform everything** — rewrite all `const` declarations inside the callback, and rely on the TypeScript type system to flag any that aren't `ExprProxy<T>`. Simple to implement; may produce confusing errors for non-shader vars.

2. **Type-aware tracking** — walk the AST and track which identifiers are known to hold `ExprProxy` values (i.e. returned by `vec2`, `sin`, `$.uv`, etc.). Only rewrite those. More accurate but significantly more complex.

**Recommendation:** Start with option 1. In practice, fragment callbacks are narrow and flat — they rarely contain non-shader `const` declarations. The type system is a sufficient safety net.

## Implementation sketch

### 1. Vite plugin shell

```ts
// vite-plugin-shdr.ts
import type { Plugin } from "vite";

export function shdrPlugin(): Plugin {
  return {
    name: "vite-plugin-shdr",
    transform(code, id) {
      if (!id.endsWith(".ts") && !id.endsWith(".js")) return;
      if (!code.includes("compileFragment") && !code.includes("createShader")) return;
      return transformShdrSource(code, id);
    },
  };
}
```

The early-exit guard (`includes("compileFragment")`) keeps the plugin fast — it only parses files that are plausibly relevant.

### 2. Source parsing

Use `acorn` (already bundled with Vite) or `@babel/parser` to parse the source into an AST. `acorn` is lighter; `@babel/parser` handles more TypeScript edge cases.

```ts
import { parse } from "acorn";

const ast = parse(code, { ecmaVersion: 2022, sourceType: "module" });
```

### 3. Finding the callback

Walk the AST for `CallExpression` nodes matching:
- `compileFragment(fn)` — direct call
- `createShader({ fragment: fn })` — object shorthand or property

Extract the `fn` arrow function or function expression body.

### 4. Rewriting `const` declarations

Walk the callback body. For each `VariableDeclaration` with `kind: "const"`:

```
const x = <expr>   →   const x = $.let("x", <expr>)
const X = <expr>   →   const X = $.const("X", <expr>)
```

Use string manipulation on the original source (via node `start`/`end` offsets) rather than AST-to-code regeneration — simpler and preserves formatting everywhere outside the rewritten nodes. [`magic-string`](https://github.com/Rich-Harris/magic-string) is the standard tool for this (it's a Vite dependency).

### 5. Source maps

`magic-string` generates source maps automatically. Return both `code` and `map` from the transform hook so errors and debugger breakpoints point to the original source.

## Key unknowns / risks

- **Scoping** — `const` declarations inside nested functions, `if` blocks, or loops within the callback need to be excluded or handled carefully. For now, assume callbacks are flat (which is true in practice).
- **Shared expressions** — if the same `ExprProxy` is assigned to a `const` and used in multiple places, `$.let` emits it as a named variable (referenced multiple times in GLSL). Without `$.let`, it gets inlined at every use site. The transform preserves the "inline once, reference by name" behavior correctly.
- **Destructuring** — `const { x, y } = someVec` is not a case the transform needs to handle (GLSL structs aren't in scope yet), but should be explicitly ignored rather than accidentally rewritten.
- **HMR** — Vite's hot module replacement should work naturally since the transform runs on every file change, but worth verifying that the plugin invalidates correctly.

## Relationship to existing code

- `src/shdr/compile.ts` — no changes needed. `$.let` and `$.const` already exist and work correctly. The transform is purely additive.
- `src/shdr/types.ts` — no changes needed.
- New file: `vite-plugin-shdr.ts` (or `src/shdr/vite-plugin.ts`)
- `vite.config.ts` — add `shdrPlugin()` to the plugins array

## Future ideal: schema-free `defn`

The same transform that eliminates `$.let` boilerplate could also eliminate the runtime schema argument from `defn`. Today the intended API is:

```ts
import { Float, Mat2 } from "./shdr";

const rot = defn("rot", { a: Float }, Mat2, ({ a }) => {
  return mat2(cos(a), sin(a), sin(a).neg(), cos(a));
});
```

`{ a: Float }` (where `Float` is a dual-namespace const/type) must be passed at runtime so the compiler knows the GLSL parameter types. The ideal form would be:

```ts
interface RotArgs { a: Float }

const rot = defn<RotArgs, Mat2>("rot", ({ a }) => { ... });
// or, if the name can also be inferred from the binding:
const rot = defn<RotArgs, Mat2>(({ a }) => { ... });
```

This is not achievable in pure TypeScript — generic type parameters are erased at runtime, so `defn` cannot inspect `RotArgs` to produce the `{ a: "float" }` schema it needs. The Vite transform would solve this by:

1. Detecting `defn<RotArgs, Mat2>(...)` call sites
2. Reading the `RotArgs` interface definition from the AST
3. Injecting the runtime schema: `defn("rot", { a: Float }, Mat2, ...)`
4. Optionally inferring the name `"rot"` from the `const rot =` binding

This is a natural extension of the implicit naming transform and should be scoped as part of the same plugin implementation.

## Prior art

- **Svelte compiler** — transforms `$:` reactive statements, `<script setup>` bindings, etc. at build time. Direct conceptual ancestor.
- **Vue `<script setup>`** — similar: `const x = ref(0)` becomes reactive at compile time via a transform.
- **SolidJS** — JSX transform injects fine-grained reactivity.
- **`babel-plugin-macros`** — general pattern for compile-time rewriting of JS.

The pattern is well-established. The shdr transform is simpler than any of the above because the rewrite rule is narrow and mechanical.
