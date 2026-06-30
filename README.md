# shdr

A TypeScript DSL for writing WebGL2 fragment shaders.

`shdr` lets you author shaders as typed TypeScript expressions, compile them to GLSL ES 3.00, and run them on a canvas. It also includes an optional Vite transform for cleaner shader source files.

> Experimental / noodling project. APIs are still changing.

## Install

```bash
pnpm install
```

## Development

```bash
pnpm dev
pnpm check
pnpm build
```

## Basic usage

```ts
import { createShader, type FragmentFn } from "./shdr/index.ts";

const fragment: FragmentFn = ({ $, vec3, vec4 }) => {
  const color = vec3($.uv.x, $.uv.y, 1.0);
  $.output(vec4(color, 1.0));
};

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
createShader({ canvas, fragment });
```

The compiler emits GLSL ES 3.00 and the runtime uses WebGL2.

## Shader context

Inside a fragment, `$` exposes built-in shader values:

```ts
$.time; // float, seconds
$.resolution; // vec2, physical canvas size
$.mouse; // vec2, physical pixel mouse position
$.coord; // vec2, raw gl_FragCoord.xy
$.uv; // vec2, normalized coordinate in [0, 1]
$.u; // custom uniforms
```

`$.fragCoord` was intentionally replaced by `$.coord`.

## Expressions and builtins

Shader values are `ExprProxy<T>` objects. Use chainable methods or builtins instead of JS arithmetic when the receiver is a shader expression:

```ts
const centeredUv = $.uv.sub(0.5);
const wave = sin(centeredUv.x.mul(4.0).add($.time));
```

A convenience `float(...)` helper promotes a JS number into shader-expression land:

```ts
const spreadFactor = float(0.625);
const spreadAmount = spreadFactor.neg().add(1.0).mul(2.5).add(0.5);
```

You do **not** need to wrap every number. Numeric arguments are accepted by expression methods once the receiver is already a shader expression.

## Custom uniforms

```ts
import { createShader, uniform, type FragmentFn } from "./shdr/index.ts";

const uniforms = {
  pixelation: uniform.float(40),
};

const fragment: FragmentFn<typeof uniforms> = ({ $, vec4 }) => {
  const amount = $.u.pixelation;
  $.output(vec4(amount.div(100.0), 0.0, 1.0, 1.0));
};

const shader = createShader({ canvas, fragment, uniforms });
shader.uniforms.pixelation.set(24);
```

Supported uniform helpers:

```ts
uniform.float(1);
uniform.vec2([1, 2]);
uniform.vec3([1, 2, 3]);
uniform.vec4([1, 2, 3, 4]);
uniform.texture2D("/image.jpg");
```

Texture uniforms expose both the sampler and resolution:

```ts
texture($.u.texture, $.uv); // samples u_texture
$.u.textureResolution; // vec2, u_texture_resolution
```

`uniform.texture2D(...)` accepts URL strings and local `File` / `Blob` values.

## Reusable shader functions

Use `fn(...)` to define reusable GLSL functions:

```ts
import { fn, Float, Mat2 } from "./shdr/index.ts";

export const rot = fn([Float], Mat2, ([a], { sin, cos, mat2 }) => {
  const s = sin(a);
  const c = cos(a);
  return mat2(c, s.neg(), s, c);
});
```

In `.shdr.ts` files, the Vite transform infers the GLSL function name from the binding. Without the transform, pass the name explicitly:

```ts
fn("rot", [Float], Mat2, body);
```

## `.shdr.ts` files and implicit naming

Files ending in `.shdr.ts` or `.shdr.tsx` opt into the Vite transform.

The transform rewrites shader declarations in memory only; your source files are not modified.

```ts
// source in fragment.shdr.ts
const centeredUv = $.uv.sub(0.5);
const COLOR_BLUE = vec3(0.2, 0.4, 1.0);
const rot = fn([Float], Mat2, body);
```

becomes roughly:

```ts
const centeredUv = $.let("centeredUv", $.uv.sub(0.5));
const COLOR_BLUE = $.const("COLOR_BLUE", vec3(0.2, 0.4, 1.0));
const rot = fn("rot", [Float], Mat2, body);
```

Naming rules:

| Source declaration                | Transform behavior                |
| --------------------------------- | --------------------------------- |
| `camelCase`                       | `$.let("camelCase", expr)`        |
| `SCREAMING_CASE` in fragments     | `$.const("SCREAMING_CASE", expr)` |
| `SCREAMING_CASE` in `fn()` bodies | left inline                       |
| `_prefixed`                       | untouched escape hatch            |
| destructuring                     | untouched                         |
| multiple declarators              | untouched                         |

Explicit style is still valid and can be mixed in:

```ts
const factor = $.let(0.625); // transform infers name
const FACTOR = $.const(0.625); // transform infers name
const named = $.let("named", expr); // already explicit; unchanged
```

Recommended sketch layout:

```txt
src/fragments/my-sketch/
  fragment.shdr.ts  # shader code with implicit naming
  index.ts          # normal setup / controls / barrel exports
```

## Example sketches

Current sketches live in `src/fragments`:

- `ben-day-spotlight`
- `pixelation`
- `moby-gradient`
- `circles`
- `horizon-burn`

Each sketch exposes a `setup(canvas, gui)` function from its `index.ts`.
