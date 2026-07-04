# PRD: DSL Completeness — Builtins, Branchless Helpers, Texture Sugar

## Problem

`shdr` has a solid core: typed shader expressions, reusable `fn(...)`, custom uniforms, texture uniforms, and the `.shdr.ts` implicit naming transform.

The next step is to make the DSL feel more complete and ergonomic for day-to-day shader authoring. Three areas stand out:

1. Builtin GLSL coverage is uneven between fragment callbacks and `fn()` callbacks.
2. Branchless shader logic is powerful but still reads like low-level GLSL (`mix` + `step`).
3. Texture uniforms work but use a flat API that could be more discoverable.

This PRD covers improvements for those three areas.

---

## Goals

- Make fragment and `fn()` callback builtin surfaces consistent.
- Add a small set of missing high-value GLSL builtins.
- Add branchless helper functions that improve readability without introducing real boolean/control-flow support yet.
- Add optional object-like texture uniform sugar while preserving the current flat API.

---

## Non-Goals

- Do not add full boolean / `bvec` type support yet.
- Do not add statement-level `if` / control-flow DSL yet.
- Do not remove existing GLSL-native helpers like `step`, `mix`, or `texture`.
- Do not break existing texture API:
  - `$.u.texture`
  - `$.u.textureResolution`
  - `texture($.u.texture, uv)`

---

# 1. Builtin Coverage

## Current State

`src/shdr/builtins.ts` already implements more builtins than fragment callbacks currently expose.

### Existing builtins

Constructors:

```ts
float;
vec2;
vec3;
vec4;
mat2;
```

Scalar/genType builtins:

```ts
sin;
cos;
abs;
fract;
sqrt;
floor;
asin;
acos;
ceil;
sign;
exp;
exp2;
log;
log2;
normalize;
```

Multi-arg / geometry builtins:

```ts
mix;
smoothstep;
radians;
dot;
length;
atan;
step;
mod;
min;
max;
clamp;
pow;
cross;
reflect;
texture;
```

Arithmetic helpers:

```ts
add;
sub;
mul;
div;
neg;
```

## Issue

`fn()` callbacks currently expose more builtins than fragment callbacks. Fragment callbacks are missing some builtins that already exist in `builtins.ts`.

Known missing-from-fragment-context builtins:

```ts
ceil;
sign;
pow;
exp;
exp2;
log;
log2;
normalize;
clamp;
cross;
reflect;
```

## Phase 1 — Make builtin surfaces consistent

Update fragment callback builtins so `FragmentFn` receives the same core builtin set as `FnContext`.

This is mostly a `compile.ts` wiring/API consistency task.

### Acceptance criteria

This should work inside a fragment:

```ts
export const fragment: FragmentFn = ({
  $,
  pow,
  clamp,
  normalize,
  vec3,
  vec4,
}) => {
  const value = pow($.uv.x, 2.0);
  const color = normalize(vec3(value, $.uv.y, 1.0));
  const clamped = clamp(color, 0.0, 1.0);
  $.output(vec4(clamped, 1.0));
};
```

---

## Phase 2 — Add missing high-value GLSL builtins

Add these low-risk builtins:

```ts
tan;
degrees;
distance;
```

### `tan`

Completes the basic trig set:

```ts
sin;
cos;
tan;
```

### `degrees`

Complements existing `radians`:

```ts
radians(180.0);
degrees(PI);
```

### `distance`

Avoids the common pattern:

```ts
length(a.sub(b));
```

Preferred:

```ts
distance(a, b);
```

Add overloads for:

```ts
distance(vec2, vec2) -> float
distance(vec3, vec3) -> float
distance(vec4, vec4) -> float
```

## Phase 3 — Optional geometry/derivative builtins

Consider adding:

```ts
refract;
faceforward;
dFdx;
dFdy;
fwidth;
```

### `refract` / `faceforward`

Complements existing `reflect` and covers the common GLSL geometry set.

### `dFdx`, `dFdy`, `fwidth`

Useful for antialiasing procedural shapes and edges:

```ts
const edgeWidth = fwidth(dist);
const mask = smoothstep(radius.sub(edgeWidth), radius.add(edgeWidth), dist);
```

These are available in WebGL2 / GLSL ES 3.00 fragment shaders.

---

# 2. Branchless / Mask Helpers

## Problem

Shader authors often avoid dynamic branching and use float masks:

```ts
const hasMouse = step(0.0001, length($.mouse));
const mouseUv = mix(vec2(0.5), $.mouse.div($.resolution), hasMouse);
```

This is idiomatic GLSL, but it requires users to remember `step` argument order and mentally translate `mix(a, b, mask)` into a branchless conditional.

The DSL can offer helpers that preserve the same GLSL output while making intent clearer.

## Design Principle

Do **not** add full boolean types yet.

Instead, use `float` masks:

```ts
0.0 -> false-ish
1.0 -> true-ish
```

This matches common shader practice and avoids expanding the type system to include:

```ts
bool;
bvec2;
bvec3;
bvec4;
```

## Proposed Helpers

### `saturate(x)`

Clamp to `[0, 1]`:

```ts
saturate(x) = clamp(x, 0.0, 1.0);
```

Works for:

```ts
float;
vec2;
vec3;
vec4;
```

Example:

```ts
const falloff = saturate(dist.neg().add(1.0));
```

### `inverseLerp(min, max, value)`

Normalize `value` from `[min, max]` into approximately `[0, 1]`:

```ts
inverseLerp(min, max, value) = (value - min) / (max - min);
```

Example:

```ts
const t = inverseLerp(0.2, 0.8, dist);
```

### `remap(value, inMin, inMax, outMin, outMax)`

Map a value from one range to another:

```ts
remap(value, inMin, inMax, outMin, outMax);
```

Equivalent:

```ts
outMin + inverseLerp(inMin, inMax, value) * (outMax - outMin);
```

Example:

```ts
const brightness = remap(dist, 0.0, 1.0, 1.0, 0.2);
```

### `remapClamped(value, inMin, inMax, outMin, outMax)`

Same as `remap`, but clamps the interpolation factor to `[0, 1]`.

Example:

```ts
const vignette = remapClamped(dist, 0.2, 0.8, 1.0, 0.0);
```

### `select(mask, whenTrue, whenFalse)`

Branchless ternary using a float mask:

```ts
select(mask, whenTrue, whenFalse) = mix(whenFalse, whenTrue, mask);
```

Example:

```ts
const hasMouse = step(0.0001, length($.mouse));
const mouseUv = select(hasMouse, $.mouse.div($.resolution), vec2(0.5));
```

This reads closer to:

```ts
hasMouse ? mouse : center;
```

while still compiling to branchless GLSL.

### `between(value, min, max)`

Return a float mask that is `1.0` when `value` is between `min` and `max`, else `0.0`.

Implementation:

```ts
between(value, min, max) = step(min, value) * step(value, max);
```

Example:

```ts
const horizonBand = between($.uv.y, 0.45, 0.55);
const color = mix(sky, horizon, horizonBand);
```

## Optional Mask Comparison Helpers

These are possible, but should be considered carefully because they look like boolean comparisons while returning float masks.

Potential names:

```ts
maskGte(a, b); // step(b, a), 1 when a >= b
maskLte(a, b); // step(a, b), 1 when a <= b
```

Possible mouse example:

```ts
const hasMouse = maskGte(length($.mouse), 0.0001);
```

These are essentially readability wrappers around `step(...)`.

Recommendation: implement `saturate`, `inverseLerp`, `remap`, `remapClamped`, `select`, and `between` first. Revisit `maskGte` / `maskLte` after seeing real usage.

## Acceptance criteria

This should compile and produce equivalent GLSL to `step`/`mix` manually:

```ts
const hasMouse = step(0.0001, length($.mouse));
const mouseUv = select(hasMouse, $.mouse.div($.resolution), vec2(0.5));

const dist = distance($.uv, vec2(0.5));
const vignette = remapClamped(dist, 0.2, 0.8, 1.0, 0.0);
const band = between($.uv.y, 0.45, 0.55);
```

---

# 3. Texture Object Sugar

## Current State

Texture uniforms currently use a flat API:

```ts
$.u.texture;
$.u.textureResolution;
texture($.u.texture, uv);
```

This works and should remain supported.

## Problem

The flat API is slightly less discoverable:

- sampler and resolution are related but appear as separate fields
- `textureResolution` relies on naming convention
- sampling requires knowing the standalone `texture(...)` builtin

## Proposed Object-Like API

Allow:

```ts
$.u.texture.sample(uv);
$.u.texture.resolution;
```

Equivalent to:

```ts
texture($.u.texture, uv);
$.u.textureResolution;
```

## Design considerations

The current `ExprProxy` system represents `$.u.texture` as an expression of type `sampler2D`. Object-like access would require special handling for texture uniforms.

Possible approaches:

### Approach A — Special texture proxy

Texture uniforms return a custom object instead of a plain `ExprProxy<"sampler2D">`:

```ts
type TextureUniformProxy = ExprProxy<"sampler2D"> & {
  readonly resolution: ExprProxy<"vec2">;
  sample(uv: Expr<"vec2">): ExprProxy<"vec4">;
};
```

Then:

```ts
$.u.texture.sample($.uv);
$.u.texture.resolution;
```

### Approach B — Keep flat API only, add helper functions

Add helpers:

```ts
textureResolution($.u.texture);
sample($.u.texture, uv);
```

This is less magical but also less ergonomic.

### Approach C — Add object sugar as optional layer

Keep current flat API exactly as-is and add object sugar only for texture uniforms.

Recommendation: Approach C. Preserve the existing API while making texture usage nicer.

## Open questions

- How should TypeScript infer that `$.u.texture` has `.sample(...)` and `.resolution`?
- Should `TextureUniformProxy` still be assignable where `ExprProxy<"sampler2D">` is expected?
- How should this interact with swizzle/field access behavior on `ExprProxy` proxies?
- Should texture object sugar work only for custom uniforms, or could it apply to any sampler expression?

## Acceptance criteria

This should work:

```ts
const texColor = $.u.texture.sample($.uv);
const textureAR = $.u.texture.resolution.x.div($.u.texture.resolution.y);
```

and emit equivalent GLSL to:

```glsl
texture(u_texture, shdr_uv)
u_texture_resolution.x / u_texture_resolution.y
```

The existing flat API must continue to work:

```ts
texture($.u.texture, $.uv);
$.u.textureResolution;
```

---

## Suggested Implementation Order

1. Expose existing builtins consistently between fragment and `fn()` callbacks.
2. Add missing low-risk GLSL builtins:
   - `tan`
   - `degrees`
   - `distance`
3. Add texture object sugar:
   - `$.u.texture.sample(uv)`
   - `$.u.texture.resolution`
4. Add branchless helper functions:
   - `saturate`
   - `inverseLerp`
   - `remap`
   - `remapClamped`
   - `select`
   - `between`
5. Add optional additional GLSL builtins:
   - `refract`
   - `faceforward`
   - `dFdx`
   - `dFdy`
   - `fwidth`

This order first makes the existing GLSL/builtin surface consistent, then improves the texture authoring API before adding higher-level branchless helper sugar.
