# Compiler Next Steps

High-level follow-up ideas for the `shdr` compiler and transform.

## 1. Better diagnostics for skipped declarations

The `.shdr.ts` transform intentionally skips some declaration forms to avoid surprising or unsafe rewrites:

- destructuring declarations
- multiple declarators in one statement
- declarations without initializers
- `_prefixed` escape-hatch declarations
- unsupported/nested callback scopes

Right now these are mostly silent. Better diagnostics could help users understand why something did not become a GLSL local.

Possible approach:

- collect skipped declaration reasons during transform
- emit dev-only warnings with file/line/column
- keep production builds quiet unless the issue is definitely invalid

Example warning:

```txt
shdr: skipped implicit declaration transform for destructuring at fragment.shdr.ts:12.
Use a named declaration or keep this as an explicit JS escape hatch.
```

## 2. Warn on likely implicit shader code in normal `.ts` files

The implicit transform only runs in:

```txt
*.shdr.ts
*.shdr.tsx
```

That is intentional because the transform changes normal TypeScript semantics. However, users may accidentally write implicit-style shader code in a normal `.ts` file:

```ts
const uv = $.uv.sub(0.5);
```

In a normal `.ts` file, this will not become:

```ts
$.let("uv", ...)
```

Potential diagnostic:

```txt
shdr: this file appears to contain implicit shader declarations but is not named .shdr.ts.
Rename it to fragment.shdr.ts or use explicit $.let/$.const calls.
```

This should be conservative to avoid noisy warnings. Possible signals:

- imports `FragmentFn` or `fn` from `shdr`
- contains a `FragmentFn` callback
- contains top-level declarations inside a shader callback that are not explicit `$.let` / `$.const`
- file does not match `.shdr.ts`

## 3. Object-like texture API

Current texture uniform API is flat:

```ts
$.u.texture;
$.u.textureResolution;
texture($.u.texture, $.uv);
```

This works, but an object-like API may feel cleaner:

```ts
$.u.texture.sample($.uv);
$.u.texture.resolution;
```

Potential benefits:

- groups sampler and resolution together
- makes texture sampling more discoverable
- reduces naming conventions like `textureResolution`

Open questions:

- how to represent texture uniform objects in the current `ExprProxy`/AST model
- whether `.sample(...)` should be syntax sugar over the existing `texture(...)` builtin
- how to type texture uniforms differently from scalar/vector uniforms
- how this interacts with generated GLSL names:
  - `u_texture`
  - `u_texture_resolution`

A conservative path would be to keep the current flat API and add object-like texture access as optional sugar later.
