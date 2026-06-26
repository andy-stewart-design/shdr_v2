# PRD: WGSL / WebGPU Backend

## Vision

The DSL should be able to target both WebGL (GLSL) and WebGPU (WGSL) without any
changes to user-facing code. The same fragment function that compiles to GLSL today
should compile to valid WGSL tomorrow:

```ts
import { rot, noise, filmGrain } from "./shader-utils";

// This code is unchanged regardless of target
const fragment = ({ $, vec4, sin, mix, smoothstep, radians }) => {
  // ... shader body ...
  $.output(vec4(finalColor, 1.0));
};

// Target selection happens at the call site
const glsl = compileFragment(fragment, { target: "glsl" }); // today
const wgsl = compileFragment(fragment, { target: "wgsl" }); // future

createShader({ canvas, fragment });           // WebGL
createShaderGPU({ canvas, fragment });        // WebGPU
```

## Why the architecture already supports this

The AST is language-agnostic. `BinOpNode`, `CallNode`, `FieldNode`, `FnCallNode` etc.
carry no GLSL-specific information. All target-specific logic is isolated in the
compilation layer. A WGSL backend is a new implementation of that layer pointed at
the same AST.

```
DSL (fn, $.let, $.const, builtins)
         ↓
      AST (language-agnostic)
       ↙        ↘
 GLSL compiler   WGSL compiler   ← only this needs to be new
       ↓                ↓
  WebGL runtime   WebGPU runtime  ← and this
```

## What maps cleanly

Most expression-level GLSL maps directly to WGSL:

| Construct | GLSL | WGSL |
|---|---|---|
| `BinOpNode` | `(a + b)` | `(a + b)` |
| `CallNode` | `sin(x)` | `sin(x)` |
| `FieldNode` | `v.x` | `v.x` |
| `UnaryNode` | `(-x)` | `(-(x))` |
| Most builtins | `sin`, `cos`, `mix`, `fract`, `floor`, `smoothstep`, `dot`, `length`, `radians` | identical names |

## What differs

### Type names

WGSL uses concrete type names:

| DSL `GlslType` | GLSL | WGSL |
|---|---|---|
| `"float"` | `float` | `f32` |
| `"vec2"` | `vec2` | `vec2f` |
| `"vec3"` | `vec3` | `vec3f` |
| `"vec4"` | `vec4` | `vec4f` |
| `"mat2"` | `mat2` | `mat2x2f` |

This is a one-line change to the keyword map — from `glslKeyword` to `wgslKeyword`.

### Variable declarations

GLSL emits typed declarations; WGSL uses `let`:

```glsl
float speed = (u_time * 2.0);   // GLSL
```
```wgsl
let speed = (uniforms.time * 2.0);  // WGSL
```

The `varType` field on `BodyStatement` is still needed (for GLSL) but ignored by the
WGSL emitter.

### Function definitions

```glsl
mat2 rot(float _p0) { return mat2(...); }   // GLSL
```
```wgsl
fn rot(_p0: f32) -> mat2x2f { return mat2x2f(...); }  // WGSL
```

### Uniforms

GLSL has loose uniforms. WGSL requires a uniform buffer struct:

```wgsl
struct Uniforms {
  time:       f32,
  resolution: vec2f,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
```

`$.time` compiles to `uniforms.time`, `$.resolution` to `uniforms.resolution`.
The DSL is unchanged — only the ref path differs in the emitter.

### Entry point and output

```glsl
// GLSL
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  ...
  gl_FragColor = vec4(color, 1.0);
}
```
```wgsl
// WGSL
@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / uniforms.resolution;
  ...
  return vec4f(color, 1.0);
}
```

`$.output(expr)` compiles to `return expr;` in WGSL (rather than assigning to
`gl_FragColor`). This is why renaming `$.fragColor` → `$.output` was important —
the DSL method name no longer implies a specific target's output mechanism.

### `fract` → `fract` (no change), but `mix` → `mix` (no change)

Most built-in names are the same. Exceptions to check at implementation time:
- `mod` (GLSL) → `%` operator or `fract(a/b)*b` in WGSL
- `dFdx`/`dFdy` (GLSL) → `dpdx`/`dpdy` (WGSL) — not currently in the DSL

## Implementation plan

### Phase 1 — WGSL compiler

New file `src/shdr/compile-wgsl.ts` implementing:
- `wgslKeyword: Record<GlslType, string>`
- `compileExprWGSL(node: AstNode): string` — mostly identical to `compileExpr`, minor syntax diffs
- `compileFnDefWGSL(def: FnDef): string` — `fn name(p: type) -> returnType { ... }`
- `compileFragmentWGSL(fn: FragmentFn): string` — WGSL preamble + entry point

`compileFragment` gains an optional `{ target?: "glsl" | "wgsl" }` option and
delegates to the appropriate compiler. Default remains `"glsl"` for backward
compatibility.

### Phase 2 — WebGPU runtime

New file `src/shdr/runtime-webgpu.ts` implementing `createShaderGPU`:
- Request `GPUAdapter` / `GPUDevice`
- Compile vertex + fragment shader modules via `device.createShaderModule`
- Create a `GPURenderPipeline` (vertex: full-screen triangle, fragment: user shader)
- Create uniform buffer for `time` + `resolution`, update each frame
- `GPURenderPassDescriptor` targeting the canvas context
- `requestAnimationFrame` loop + `ResizeObserver` (same as WebGL runtime)
- Returns `ShaderInstance` with `destroy()` — same interface as the WebGL runtime

### Phase 3 — Unified entry point (optional)

`createShader` could auto-detect WebGPU availability and prefer it:

```ts
createShader({
  canvas,
  fragment,
  prefer: "webgpu" | "webgl" | "auto", // default: "auto"
});
```

## Unknowns / risks

- **`mat2x2f` constructor syntax** — WGSL mat constructors take column vectors,
  need to verify the argument order matches what the DSL emits
- **Number literals** — WGSL requires `f32` suffix on float literals in some
  contexts (`1.0f` or `f32(1.0)`). The emitter may need to suffix-annotate numbers.
- **Implicit type conversions** — GLSL is permissive; WGSL is strict. `sin(1.0)`
  is fine in GLSL; WGSL may require `sin(f32(1.0))`. The DSL's `toNode(number)`
  path would need to emit explicit casts in WGSL mode.
- **Browser support** — WebGPU is not universally available yet. The runtime should
  degrade gracefully to WebGL when WebGPU is unavailable.

## Files touched

| File | Change |
|---|---|
| `src/shdr/compile-wgsl.ts` | New — WGSL compiler |
| `src/shdr/runtime-webgpu.ts` | New — WebGPU runtime |
| `src/shdr/compile.ts` | Add `target` option, delegate to WGSL compiler |
| `src/shdr/index.ts` | Re-export `createShaderGPU`, `compileFragmentWGSL` |
| `src/shdr/types.ts` | No changes needed |
| `src/shdr/ast.ts` | No changes needed |
| `src/shdr/builtins.ts` | No changes needed |
| `src/shdr/fn.ts` | No changes needed |
