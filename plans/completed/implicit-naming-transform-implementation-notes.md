# Implicit Naming Transform — Implementation Notes

This records what was implemented after the revised plan.

## Completed

- Added `shdrPlugin()` Vite plugin.
- Added `oxc-parser` + `magic-string` transform pipeline.
- Restricted transform to `*.shdr.ts` / `*.shdr.tsx`.
- Added implicit declaration naming:
  - `camelCase` → `$.let("name", expr)`
  - `SCREAMING_CASE` in fragment bodies → `$.const("NAME", expr)`
  - `_prefixed` → untouched
- Added explicit helper name inference:
  - `const x = $.let(expr)` → `$.let("x", expr)`
  - `const X = $.const(expr)` → `$.const("X", expr)`
- Added `fn(...)` name inference in transformed files.
- Added TypeScript overloads so nameless `fn(...)` source forms typecheck before transform.
- Added transform support for `fn()` local contexts:
  - identifier context arg: emits `ctx.$.let(...)`
  - destructured context arg: injects `$` when needed
- Added `float(...)` expression constructor to make JS-number-to-shader-float promotion less awkward.
- Migrated all sketches to the `fragment.shdr.ts` + `index.ts` pattern.

## Migrated sketches

- `src/fragments/ben-day-spotlight/fragment.shdr.ts`
- `src/fragments/pixelation/fragment.shdr.ts`
- `src/fragments/moby-gradient/fragment.shdr.ts`
- `src/fragments/moby-gradient/utils.shdr.ts`
- `src/fragments/circles/fragment.shdr.ts`
- `src/fragments/circles/utils.shdr.ts`
- `src/fragments/horizon-burn/fragment.shdr.ts`

## Important behavior

The transform changes TypeScript semantics, so implicit naming only runs in `.shdr.ts` files.

Normal `.ts` files may still use explicit DSL calls:

```ts
const uv = $.let("uv", $.uv.sub(0.5));
```

but implicit style requires `.shdr.ts`:

```ts
const uv = $.uv.sub(0.5);
```

## Known limitations / future work

- No parser abstraction or Babel fallback yet.
- Multiple declarators are skipped.
- Destructuring declarations are skipped.
- Better diagnostics for skipped/unsupported declarations would be useful.
- Schema-free `fn<Args, Return>(...)` remains future work.
