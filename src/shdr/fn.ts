import { NODE, makeProxy, refProxy, toNode } from "./ast";
import { compileFn } from "./compile";
import { createFnContext, type FnContext } from "./context/fn";
import type {
  AstNode,
  ExprProxy,
  FnDef,
  GlslType,
  ParamsToExprs,
  ShaderFn,
  TupleToExprs,
  TupleShaderFn,
} from "./types.ts";

type FnMetadata = {
  readonly _def: FnDef;
  readonly glsl: string;
};

function attachFnMetadata<F extends object>(fn: F, def: FnDef): F & FnMetadata {
  Object.defineProperties(fn, {
    _def: { value: def, writable: false },
    glsl: {
      get: () => compileFn({ _def: def }),
      enumerable: true,
    },
  });

  return fn as F & FnMetadata;
}

// ---------------------------------------------------------------------------
// fn — array form (positional args)
//
//   const rot = fn("rot", [Float], Mat2, ([a], $) => mat2(cos(a), ...));
//   rot(angle)  // ExprProxy<"mat2">
//
// GLSL param names are auto-generated (_p0, _p1, …). The Vite transform
// (plans/implicit-naming-transform.md) will eventually infer them from
// the destructuring pattern.
// ---------------------------------------------------------------------------

const GLSL_TYPES = [
  "float",
  "vec2",
  "vec3",
  "vec4",
  "mat2",
  "sampler2D",
] as const;

function isGlslType(value: unknown): value is GlslType {
  return typeof value === "string" && GLSL_TYPES.includes(value as GlslType);
}

function isGlslTypeArray(value: unknown): value is GlslTypeArray {
  return Array.isArray(value) && value.every(isGlslType);
}

type TupleFnBody<T extends readonly GlslType[], R extends GlslType> = (
  args: TupleToExprs<T>,
  ctx: FnContext,
) => ExprProxy<R>;

type NamedFnBody<S extends Record<string, GlslType>, R extends GlslType> = (
  args: ParamsToExprs<S>,
  ctx: FnContext,
) => ExprProxy<R>;

type GlslTypeArray = GlslType[] | readonly GlslType[];

type NamedFnImplementationArgs<R extends GlslType> =
  | [
      name: string,
      params: GlslTypeArray,
      returnType: R,
      body: TupleFnBody<readonly GlslType[], R>,
    ]
  | [
      name: string,
      params: Record<string, GlslType>,
      returnType: R,
      body: NamedFnBody<Record<string, GlslType>, R>,
    ];

type FnImplementationArgs<R extends GlslType> =
  | NamedFnImplementationArgs<R>
  | [
      params: GlslTypeArray,
      returnType: R,
      body: TupleFnBody<readonly GlslType[], R>,
    ]
  | [
      params: Record<string, GlslType>,
      returnType: R,
      body: NamedFnBody<Record<string, GlslType>, R>,
    ];

function isNamedFnArgs<R extends GlslType>(
  args: FnImplementationArgs<R>,
): args is NamedFnImplementationArgs<R> {
  return typeof args[0] === "string";
}

function isTupleFnArgs<R extends GlslType>(
  args: NamedFnImplementationArgs<R>,
): args is [
  name: string,
  params: GlslTypeArray,
  returnType: R,
  body: TupleFnBody<readonly GlslType[], R>,
] {
  return isGlslTypeArray(args[1]);
}

// Nameless array form — intended for .shdr.ts files where the Vite transform
// rewrites `const rot = fn([Float], ...)` to `fn("rot", [Float], ...)`.
export function fn<T extends readonly GlslType[], R extends GlslType>(
  params: readonly [...T],
  returnType: R,
  body: TupleFnBody<T, R>,
): TupleShaderFn<T, R>;

// Named array form — works without the transform.
export function fn<T extends readonly GlslType[], R extends GlslType>(
  name: string,
  params: readonly [...T],
  returnType: R,
  body: TupleFnBody<T, R>,
): TupleShaderFn<T, R>;

// Nameless object form — intended for .shdr.ts files where the Vite transform
// injects the binding name.
export function fn<S extends Record<string, GlslType>, R extends GlslType>(
  params: S,
  returnType: R,
  body: NamedFnBody<S, R>,
): ShaderFn<S, R>;

// Named object form — works without the transform.
export function fn<S extends Record<string, GlslType>, R extends GlslType>(
  name: string,
  params: S,
  returnType: R,
  body: NamedFnBody<S, R>,
): ShaderFn<S, R>;

// Implementation — tuple union keeps params and body correlated.
export function fn<R extends GlslType>(...args: FnImplementationArgs<R>) {
  if (!isNamedFnArgs(args)) {
    throw new Error(
      "Nameless fn(...) calls must be compiled by the shdr Vite transform. " +
        "Use a .shdr.ts file or pass an explicit name string.",
    );
  }

  const fnContext = createFnContext();

  if (isTupleFnArgs(args)) {
    const [name, params, returnType, body] = args;
    // Auto-generate GLSL param names and typed proxies
    const paramSchema: Record<string, GlslType> = Object.fromEntries(
      params.map((t, i) => [`_p${i}`, t]),
    );
    const paramRefs = params.map((t, i) => refProxy([`_p${i}`], t));

    const returnValue = body(paramRefs, fnContext.ctx);

    const def: FnDef = {
      name,
      params: paramSchema,
      returnType,
      body: fnContext.statements,
      returnExpr: toNode(returnValue),
    };

    const fn = (...args: (ExprProxy<GlslType> | number)[]) => {
      // Guard: if the first arg is a plain object (not an ExprProxy, not a number),
      // the caller used named syntax rot({ a }) instead of positional rot(a).
      if (
        args.length > 0 &&
        args[0] !== null &&
        typeof args[0] === "object" &&
        !(NODE in args[0])
      ) {
        throw new Error(
          `fn '${name}' was defined with positional params [${params.join(", ")}] ` +
            `but called with a named-args object. Use ${name}(${params.map((_, i) => `arg${i}`).join(", ")}) instead.`,
        );
      }
      const argNodes: AstNode[] = args.map((a) => toNode(a));
      return makeProxy({ kind: "fncall", def, args: argNodes }, returnType);
    };

    return attachFnMetadata(fn, def);
  } else {
    const [name, params, returnType, body] = args;
    // ── Object form ─────────────────────────────────────────────────────────
    const paramRefs = Object.fromEntries(
      Object.entries(params).map(([key, type]) => [key, refProxy([key], type)]),
    );

    const returnValue = body(paramRefs, fnContext.ctx);

    const def: FnDef = {
      name,
      params,
      returnType,
      body: fnContext.statements,
      returnExpr: toNode(returnValue),
    };

    const fn = (args: Record<string, ExprProxy<GlslType> | number>) => {
      // Guard: if args is an ExprProxy (has NODE symbol), the caller used
      // positional syntax rot(angle) instead of named rot({ a: angle }).
      // Without strict TS this silently passes but causes a bad swizzle in GLSL.
      if (args !== null && typeof args === "object" && NODE in args) {
        throw new Error(
          `fn '${name}' was defined with named params { ${Object.keys(params).join(", ")} } ` +
            `but called with positional arguments. Use ${name}({ ${Object.keys(
              params,
            )
              .map((k, i) => `${k}: arg${i}`)
              .join(", ")} }) instead.`,
        );
      }
      const argNodes: AstNode[] = Object.keys(params).map((k) =>
        toNode(args[k]),
      );
      return makeProxy({ kind: "fncall", def, args: argNodes }, returnType);
    };

    return attachFnMetadata(fn, def);
  }
}
