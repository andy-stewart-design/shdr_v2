# PRD: Shader Inspect / Visual Debug Views

## Problem

Debugging shader code usually means manually replacing the final fragment color with an intermediate value:

```glsl
fragColor = vec4(vec3(grain), 1.0);
```

This is tedious because authors must:

- edit shader output by hand
- map floats/vec2/vec3 values into displayable colors
- remember to restore the original output
- recompile repeatedly while exploring intermediate values

Traditional `console.log(...)` does not map cleanly to shader execution because every expression has one value per fragment, not one global value. But `shdr` can provide a shader-native version of logging: **visual inspection**.

## Goal

Add an MVP `$.inspect(...)` API that lets shader authors register intermediate expressions as named visual debug views:

```ts
const grain = filmGrain($.uv);
const warpedUv = vec2(correctedUv.x.add(xWave), correctedUv.y.add(yWave));
const color = mix(layer1, layer2, blend);

$.inspect("grain", grain);
$.inspect("warpedUv", warpedUv);
$.inspect("color", color);

$.output(vec4(color, 1.0));
```

At runtime, users can switch between:

- normal shader output
- `grain`
- `warpedUv`
- `color`

without editing shader code.

This should pair naturally with a `lil-gui` select/dropdown.

---

## MVP User Experience

### Shader authoring

```ts
export const fragment: FragmentFn = ({ $, vec4 }) => {
  const grain = filmGrain($.uv);
  const finalColor = vec4(vec3(grain), 1.0);

  $.inspect("grain", grain);
  $.inspect("finalColor", finalColor);

  $.output(finalColor);
};
```

### Runtime usage

```ts
const shader = createShader({ canvas, fragment });

shader.inspect.views;
// ["off", "grain", "finalColor"]

shader.inspect.set("grain");
shader.inspect.set("off");
```

### lil-gui helper

```ts
const shader = createShader({ canvas, fragment });
addInspectControl(gui, shader);
```

Possible implementation:

```ts
export function addInspectControl(gui: GUI, shader: ShaderInstance) {
  const params = { inspect: "off" };
  gui.add(params, "inspect", shader.inspect.views).onChange((view) => {
    shader.inspect.set(view);
  });
}
```

---

## API Proposal

### Fragment context

Add to `ShaderContext`:

```ts
inspect<T extends GlslType>(name: string, value: Expr<T>): void;
```

Usage:

```ts
$.inspect("noise", noiseValue);
$.inspect("uv", warpedUv);
$.inspect("color", color);
```

Names should be unique per fragment. Duplicate names should throw at compile time with a clear error.

### Runtime instance

Extend `ShaderInstance`:

```ts
interface ShaderInstance {
  inspect: {
    readonly views: readonly string[]; // includes "off"
    set(view: string): void;
    get(): string;
  };
}
```

Behavior:

- `"off"` means normal shader output
- unknown view names throw or warn clearly
- changing inspect view updates a runtime uniform, no shader recompilation

---

## Compiler Design

### Statement model

Add a new body statement:

```ts
type InspectStatement = {
  type: "inspect";
  name: string;
  valueType: GlslType;
  value: AstNode;
};
```

`$.inspect(name, value)` appends this statement during fragment compilation.

### GLSL uniform

If a fragment has any inspect statements, emit:

```glsl
uniform int u_shdr_inspect_view;
```

Inspect view indices:

```txt
0 = off / normal output
1 = first inspect target
2 = second inspect target
...
```

The compiler should return metadata along with GLSL so the runtime knows the mapping:

```ts
type CompiledFragment = {
  glsl: string;
  inspectViews: string[]; // ["grain", "warpedUv", "color"]
};
```

This may require changing the current `compileFragment(...)` public shape or adding a lower-level helper:

```ts
compileFragment(fragment) -> string // remains public/backward compatible
compileFragmentWithMeta(fragment) -> { glsl, inspectViews }
```

`createShader(...)` should use the metadata-producing path internally.

### GLSL output injection

At the end of `main`, after normal `$.output(...)` assignment, emit conditional overrides:

```glsl
if (u_shdr_inspect_view == 1) {
  fragColor = vec4(vec3(grain), 1.0);
}
if (u_shdr_inspect_view == 2) {
  fragColor = vec4(warpedUv, 0.0, 1.0);
}
if (u_shdr_inspect_view == 3) {
  fragColor = vec4(color, 1.0);
}
```

MVP can use simple `if` statements. This is debug-only code and clarity matters more than micro-optimizing branch structure.

---

## Type-to-Color Mapping

MVP mapping:

```ts
float -> vec4(vec3(value), 1.0)
vec2  -> vec4(value, 0.0, 1.0)
vec3  -> vec4(value, 1.0)
vec4  -> value
```

Unsupported types for MVP:

- `mat2`
- `sampler2D`

Calling `$.inspect(...)` on unsupported types should throw at compile time:

```txt
$.inspect("rotation", mat) is not supported for mat2 values yet.
```

### Future range mapping

Many useful shader values are not naturally in `[0, 1]`. Future API could support:

```ts
$.inspect("dist", distFromMouse, { range: [0, 2] });
$.inspect("signed", value, { range: [-1, 1] });
```

which compiles to:

```glsl
(value - min) / (max - min)
```

MVP does not need this.

---

## Runtime Design

### Uniform

Runtime looks up:

```ts
const uInspectView = gl.getUniformLocation(program, "u_shdr_inspect_view");
```

If no inspect views exist, the uniform is not emitted and runtime inspect controls can still expose only `"off"`.

### State

Runtime stores:

```ts
let inspectView = "off";
let inspectViewIndex = 0;
```

On render:

```ts
if (uInspectView) {
  gl.uniform1i(uInspectView, inspectViewIndex);
}
```

This can be uploaded every frame or dirty-tracked. Dirty-tracking is preferable but not required for MVP.

### ShaderInstance API

```ts
return {
  uniforms,
  inspect: {
    views: ["off", ...inspectViews],
    get: () => inspectView,
    set(view) {
      const index = views.indexOf(view);
      if (index === -1) throw new Error(`Unknown inspect view: ${view}`);
      inspectView = view;
      inspectViewIndex = index;
    },
  },
  destroy() { ... },
};
```

---

## lil-gui Integration

Add a helper to `src/controls.ts`:

```ts
export function addInspectControl(gui: GuiLike, shader: ShaderInstance) {
  const params = {
    inspect: shader.inspect.get(),
  };

  return gui.add(params, "inspect", shader.inspect.views).onChange((view) => {
    shader.inspect.set(view);
  });
}
```

Potential enhancement:

- only add the control if `shader.inspect.views.length > 1`
- group under a `Debug` folder later

---

## Example

```ts
export const fragment: FragmentFn = ({ $, vec2, vec3, vec4, sin }) => {
  const centeredUv = $.uv.sub(0.5);
  const wave = sin(centeredUv.x.mul(10.0).add($.time));
  const color = vec3(wave, centeredUv.x, centeredUv.y);

  $.inspect("centeredUv", centeredUv);
  $.inspect("wave", wave);
  $.inspect("color", color);

  $.output(vec4(color, 1.0));
};
```

Generated views:

```ts
shader.inspect.views
// ["off", "centeredUv", "wave", "color"]
```

---

## Non-Goals for MVP

- No textual `console.log` equivalent.
- No `gl.readPixels(...)` value readback.
- No min/max/average/statistical reductions.
- No range mapping yet.
- No automatic GUI creation inside core runtime.
- No inspecting matrices or samplers.

---

## Future Ideas

### Mouse/cursor value readback

For a closer equivalent to logging one value, render an inspect view to a framebuffer and read one pixel under the mouse:

```ts
shader.inspect.read("grain", { x, y });
```

This is powerful but more complex because:

- `gl.readPixels` can stall the GPU
- values must be encoded into RGBA
- values outside `[0, 1]` need range mapping or packing

### Range and color maps

```ts
$.inspect("dist", dist, { range: [0, 2] });
$.inspect("signed", value, { range: [-1, 1], colormap: "blue-red" });
```

### Multi-channel scalar panels

For multiple scalar inspect values, a debug overlay could render small strips or tiles rather than replacing the whole output.

---

## Open Questions

- Should `compileFragment(...)` remain string-only and add a separate `compileFragmentWithMeta(...)`?
- Should inspect conditionals be emitted after every assignment or only after final `$.output(...)`?
- Should duplicate inspect names throw immediately during fragment compilation?
- Should the default inspect view always be `"off"`, or should development mode remember the last selected view?

---

## Design Notes

### Resolved: `compileFragmentWithMeta` is the right split

Keep `compileFragment(...)` returning `string` for backward compatibility. Add
`compileFragmentWithMeta(...)` returning `{ glsl: string, inspectViews: string[] }`.
`createShader(...)` uses the metadata path internally with no public API break.

### Resolved: conditionals emitted only after `$.output(...)`

Inspect `if` blocks should be emitted once, after the final `$.output()` assignment,
not after every intermediate statement. The inspect values are captured as named
GLSL variables at the point of each `$.inspect()` call — the final `if` blocks
just reference those names by the time they run.

### Prefer `if-else if` over multiple `if` statements

Using `if-else if` is more semantically correct than separate `if` statements and
some drivers optimize uniform-based branches more aggressively in an if-else chain.
The change from the multiple-`if` sketch in the compiler design above is trivial.

### Dirty tracking for the inspect uniform should be in MVP

The PRD lists dirty tracking as "preferable but not required." In practice it is
trivial: the uniform only changes when `.set()` is called explicitly, so a single
flag flipped in `.set()` is sufficient. It should be included from the start.

### Inline expressions vs named variables

If `$.inspect("x", $.uv.x)` is called without a preceding `$.let`, the `value:
AstNode` is a complex expression re-compiled inline into each `if` block. In
practice this is not a concern — `.shdr.ts` files run through the implicit naming
transform, so nearly all values will already be in named GLSL variables.

### Production build consideration

Even with `"off"` as the default, inspect `if` blocks and the `u_shdr_inspect_view`
uniform declaration are still emitted in production builds. For MVP this is
acceptable — inspect is a dev tool and the overhead is minimal. A future
consideration: a `$.inspect.dev(...)` variant or a build-time strip flag that
eliminates all inspect code from production output.
