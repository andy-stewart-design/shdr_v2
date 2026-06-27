# Plan: User-Defined Shader Functions (`defn`)

## Goal

Allow users to define reusable typed GLSL functions outside of `compileFragment`,
importable and composable like regular TypeScript:

```ts
// rot.ts
import { defn, Float, Mat2, sin, cos, mat2 } from "./shdr";

export const rot = defn("rot", { a: Float }, Mat2, ({ a }) => {
  return mat2(cos(a), sin(a), sin(a).neg(), cos(a));
});

// main.ts
import { rot } from "./rot.ts";

createShader({
  canvas,
  fragment: ({ $, radians }) => {
    const angle = $.let("angle", radians($.time.mul(45.0)));
    const r = $.let("r", rot(angle)); // ExprProxy<"mat2">
  },
});
```

Emitted GLSL:

```glsl
mat2 rot(float a) {
  return mat2(cos(a), sin(a), (-sin(a)), cos(a));
}

void main() {
  vec2 uv = ...;
  float angle = radians((u_time * 45.0));
  mat2 r = rot(angle);
}
```

---

## Phase 1 — Type infrastructure

**What:** Add the dual-namespace GLSL type constants and all new TypeScript types.
No runtime behaviour changes yet.

**Dual-namespace constants** (value + type in the same name):

```ts
export const Float = "float" as const;
export type Float = ExprProxy<"float">;
export const Vec2 = "vec2" as const;
export type Vec2 = ExprProxy<"vec2">;
export const Vec3 = "vec3" as const;
export type Vec3 = ExprProxy<"vec3">;
export const Vec4 = "vec4" as const;
export type Vec4 = ExprProxy<"vec4">;
export const Mat2 = "mat2" as const;
export type Mat2 = ExprProxy<"mat2">;
```

In value position (`{ a: Float }`) these are the GLSL type strings the runtime needs.
In type position (`interface Args { a: Float }`) they resolve to the correct `ExprProxy<T>`.

**New types in `types.ts`:**

```ts
// Maps a runtime param schema to typed ExprProxy args for the body callback
type ParamsToExprs<S extends Record<string, GlslType>> = {
  [K in keyof S]: ExprProxy<S[K]>;
};

// Compiled function definition — carried as metadata on FnCallNode
type FnDef = {
  name: string;
  params: Record<string, GlslType>;
  returnType: GlslType;
  body: BodyStatement[]; // local $.let statements inside the function
  returnExpr: AstNode; // the expression after `return`
};

// A ShaderFn is a callable that produces a FnCallNode when invoked,
// and also exposes its FnDef for the compiler to harvest
type ShaderFn<S extends Record<string, GlslType>, R extends GlslType> = {
  (...args: { [K in keyof S]: ExprProxy<S[K]> | number }): ExprProxy<R>;
  readonly _def: FnDef;
};
```

**New AST node in `ast.ts`:**

```ts
type FnCallNode = { kind: "fncall"; def: FnDef; args: AstNode[] };
```

**Verifiable when:** `npx tsc --noEmit` passes. No behaviour change yet.

---

## Phase 2 — `defn` + single-function compilation

**What:** Implement `defn` and teach the compiler to emit one function definition.
Functions that call other `defn` functions are not yet handled (phase 3).

**`defn` implementation (new file `src/shdr/defn.ts`):**

```ts
export function defn<S extends Record<string, GlslType>, R extends GlslType>(
  name: string,
  params: S,
  returnType: R,
  body: (args: ParamsToExprs<S>) => ExprProxy<R>,
): ShaderFn<S, R>;
```

Internally:

1. Build typed `ExprProxy` param refs from `params` (e.g. `{ a: refProxy(["a"], "float") }`)
2. Run a mini compilation pass — same `$.let` machinery as `compileFragment` but scoped
   to a local statement list
3. Call `body(paramRefs)` to get the return expression
4. Store `{ name, params, returnType, statements, returnExpr }` as the `FnDef`
5. Return a `ShaderFn`: a callable that produces `FnCallNode`s with the `FnDef` attached

**Compiler changes (`compile.ts`):**

After the fragment fn runs and statements are collected, walk the full statement/expression
tree and gather all `FnDef`s referenced via `FnCallNode`. Emit them before `main()`:

```glsl
mat2 rot(float a) {
  return mat2(cos(a), sin(a), (-sin(a)), cos(a));
}
```

`compileExpr` gets a `fncall` case:

```ts
case "fncall": return `${node.def.name}(${node.args.map(compileExpr).join(", ")})`;
```

**Verifiable when:** A single `defn`-defined function (e.g. `rot`) compiles correctly
and the GLSL output includes the function definition above `main()`.

---

## Phase 3 — Dependency resolution (functions calling functions)

**What:** Handle `defn` functions that call other `defn` functions.
The compiler must discover the full dependency graph, deduplicate, and emit in
topologically correct order.

```ts
const hash  = defn("hash",  { p: Vec2 }, Vec2, ...);
const noise = defn("noise", { p: Vec2 }, Float, ({ p, $ }) => {
  const h = $.let("h", hash(p));  // noise depends on hash
  ...
});
```

Expected output order:

```glsl
vec2 hash(vec2 p) { ... }
float noise(vec2 p) { ... }   // after hash
void main() { ... }
```

**Implementation:**

`FnDef` already carries the body's `BodyStatement[]`. Walking those statements
recursively surfaces any nested `FnCallNode`s, which carry their own `FnDef`s.
Collect all unique `FnDef`s into a set (by name), then topological-sort before emitting.

Topological sort: standard DFS with a visited set. Each `FnDef`'s dependencies are
the `FnDef`s referenced in its own body statements — so the graph is already fully
described by the data structure, no extra metadata needed.

**Verifiable when:** A chain like `noise → hash` compiles with both definitions
present and in the correct order. Circular dependencies should throw a descriptive
error (`Circular dependency detected: noise → hash → noise`).

---

## Files touched

| File                     | Change                                                    |
| ------------------------ | --------------------------------------------------------- |
| `src/shdr/types.ts`      | `FnDef`, `ShaderFn`, `ParamsToExprs`, `FnCallNode`        |
| `src/shdr/ast.ts`        | `FnCallNode` in `AstNode` union, `compileExpr` case       |
| `src/shdr/defn.ts`       | New file — `defn` function                                |
| `src/shdr/compile.ts`    | Harvest + emit `FnDef`s; topological sort                 |
| `src/shdr/glsl-types.ts` | New file — dual-namespace `Float`, `Vec2`, etc.           |
| `src/shdr/index.ts`      | Re-export `defn`, `Float`, `Vec2`, `Vec3`, `Vec4`, `Mat2` |
