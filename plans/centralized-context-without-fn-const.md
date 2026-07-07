# Centralized shdr Context Creation Without `$.const` in `fn()`

## Summary

We should consider centralizing shdr context creation while **not adding `$.const` to `fn()` bodies**.

Today, context creation is split across places:

- `compileFragment` builds the fragment shader `$` context, including:
  - `$.let(...)`
  - `$.const(...)`
  - `$.output(...)`
  - uniforms and built-in fragment inputs like `$.uv`, `$.time`, etc.
- `fn.ts` builds the function-body context, currently including only:
  - `$.let(...)`

This split is a little unintuitive because related context behavior is assembled in different files. A future cleanup could centralize the shared pieces of context construction, but `fn()` likely does **not** need the full fragment context.

## Current finding

A search of existing code under `src/fragments/` found no usages of `$.const(...)` inside `fn(...)` bodies.

There are many ordinary TypeScript `const` bindings inside `fn(...)`, for example:

```ts
const s = sin(a);
const c = cos(a);
```

There are also imported numeric constants used inside `fn(...)`, for example in `src/fragments/circles/utils.shdr.ts`:

```ts
const t = asin(r.div(R.add(r))).mul(2.0 * SPACING_FACTOR);
const divv = abs(div(TAU, t)).add(EP);
```

But these are plain JS/TS constants that become literal values in expressions. They are not `$.const(...)` shader constants.

## Why avoid `$.const` in `fn()`?

`$.const(...)` in `compileFragment` emits top-level GLSL constants before `main`:

```glsl
const float foo = ...;

void main() {
  ...
}
```

A reusable GLSL function has a different emission target:

```glsl
float myFn(float x) {
  float y = ...;
  return y;
}
```

If `$.const` were available inside `fn(...)`, we would need to decide where those constants are emitted:

1. Inside the generated GLSL function body.
2. Hoisted above the generated GLSL function.
3. Hoisted to the final fragment shader/module.

Each option has extra complexity. GLSL `const` also has stricter semantics than a normal local temporary, so using it for arbitrary computed shader expressions may be surprising or invalid depending on expression type/profile.

## Proposed direction

Centralize context creation by extracting shared context-builder pieces, but keep `fn()` context intentionally smaller.

Possible structure:

```ts
createLetContext(...)
createConstContext(...)
createFragmentContext(...)
createFnContext(...)
```

Then:

```ts
// compileFragment
const $ = createFragmentContext({
  let: createLetContext(...),
  const: createConstContext(...),
  output: ...,
  uniforms: ...,
  fragmentInputs: ...,
});
```

and:

```ts
// fn.ts
const $ = createFnContext({
  let: createLetContext(...),
});
```

This makes the difference explicit: fragment contexts support top-level constants; function-body contexts support local statements.

## Recommendation

For the first cleanup SOW:

- Centralize context construction utilities.
- Do **not** add `$.const` to `fn()`.
- Document that `fn()` supports `$.let` for local function-body temporaries, while `compileFragment` supports `$.const` for top-level shader constants.
- Revisit function-level constants only if real usage appears.

This seems consistent with current usage in `src/fragments/` and should make context creation easier to reason about without introducing unresolved GLSL emission semantics.
