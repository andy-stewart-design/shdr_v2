import { NODE, makeProxy, refProxy, toNode, glslTypeOf } from "./ast.ts";
import { compileFn } from "./compile.ts";
import {
  float,
  vec2,
  vec3,
  vec4,
  mat2,
  sin,
  cos,
  asin,
  acos,
  atan,
  abs,
  sqrt,
  floor,
  ceil,
  sign,
  fract,
  mod,
  pow,
  exp,
  exp2,
  log,
  log2,
  normalize,
  mix,
  smoothstep,
  step,
  clamp,
  dot,
  length,
  cross,
  reflect,
  radians,
  min,
  max,
  add,
  sub,
  mul,
  div,
  neg,
} from "./builtins";
import type {
  AstNode,
  ExprProxy,
  FnBodyStatement,
  FnDef,
  GlslType,
  ParamsToExprs,
  ShaderFn,
  TupleToExprs,
  TupleShaderFn,
} from "./types.ts";

// ---------------------------------------------------------------------------
// FnContext — the second arg passed to every fn body
// ---------------------------------------------------------------------------

// The local statement builder available as $.let inside fn bodies
export type LocalContext = {
  /** Declare a named local variable inside the function body. */
  let<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  /** Declare an auto-named local variable (_l0, _l1, …). */
  let<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
};

// Bundled builtins — same set available in compileFragment callbacks
const fnBuiltins = {
  float,
  vec2,
  vec3,
  vec4,
  mat2,
  sin,
  cos,
  asin,
  acos,
  atan,
  abs,
  sqrt,
  floor,
  ceil,
  sign,
  fract,
  mod,
  pow,
  exp,
  exp2,
  log,
  log2,
  normalize,
  mix,
  smoothstep,
  step,
  clamp,
  dot,
  length,
  cross,
  reflect,
  radians,
  min,
  max,
  add,
  sub,
  mul,
  div,
  neg,
};

/** The context object passed as the second argument to fn body callbacks.
 *  Mirrors the compileFragment callback context: destructure what you need.
 *  @example
 *  const rot = fn("rot", [Float], Mat2, ([a], { sin, cos, mat2 }) => {
 *    return mat2(cos(a), sin(a).neg(), sin(a), cos(a));
 *  });
 */
export type FnContext = { $: LocalContext } & typeof fnBuiltins;

function makeLocalContext(statements: FnBodyStatement[]): LocalContext {
  let counter = 0;
  return {
    let<T extends GlslType>(
      nameOrValue: string | ExprProxy<T>,
      maybeValue?: ExprProxy<T>,
    ): ExprProxy<T> {
      const name =
        typeof nameOrValue === "string" ? nameOrValue : `_l${counter++}`;
      const value = typeof nameOrValue === "string" ? maybeValue! : nameOrValue;
      const varType = glslTypeOf(value);
      statements.push({ type: "let", name, varType, value: toNode(value) });
      return refProxy([name], varType);
    },
  };
}

function attachFnMetadata<F extends object>(fn: F, def: FnDef) {
  return Object.assign(fn, {
    _def: def,
    get glsl() {
      return compileFn({ _def: def });
    },
  });
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

type FnWithAnonArgs<T extends readonly GlslType[], R extends GlslType> = (
  args: TupleToExprs<T>,
  ctx: FnContext,
) => ExprProxy<R>;

type FnWithNamedArgs<S extends Record<string, GlslType>, R extends GlslType> = (
  args: ParamsToExprs<S>,
  ctx: FnContext,
) => ExprProxy<R>;

type GlslTypeArray = GlslType[] | readonly GlslType[];

function isGlslType(value: unknown): value is GlslType {
  return typeof value === "string" && GLSL_TYPES.includes(value as GlslType);
}

function isGlslTypeArray(value: unknown): value is GlslTypeArray {
  return Array.isArray(value) && value.every(isGlslType);
}

// Nameless array form — intended for .shdr.ts files where the Vite transform
// rewrites `const rot = fn([Float], ...)` to `fn("rot", [Float], ...)`.
export function fn<T extends readonly GlslType[], R extends GlslType>(
  params: readonly [...T],
  returnType: R,
  body: FnWithAnonArgs<T, R>,
): TupleShaderFn<T, R>;

// Named array form — works without the transform.
export function fn<T extends readonly GlslType[], R extends GlslType>(
  name: string,
  params: readonly [...T],
  returnType: R,
  body: FnWithAnonArgs<T, R>,
): TupleShaderFn<T, R>;

// Nameless object form — intended for .shdr.ts files where the Vite transform
// injects the binding name.
export function fn<S extends Record<string, GlslType>, R extends GlslType>(
  params: S,
  returnType: R,
  body: FnWithNamedArgs<S, R>,
): ShaderFn<S, R>;

// Named object form — works without the transform.
export function fn<S extends Record<string, GlslType>, R extends GlslType>(
  name: string,
  params: S,
  returnType: R,
  body: FnWithNamedArgs<S, R>,
): ShaderFn<S, R>;

// Implementation — body typed as (...args: any[]) => ... to satisfy all overloads
export function fn<R extends GlslType>(
  nameOrParams: string | ReadonlyArray<GlslType> | Record<string, GlslType>,
  paramsOrReturnType: ReadonlyArray<GlslType> | Record<string, GlslType> | R,
  returnTypeOrBody: R | ((...args: any[]) => ExprProxy<R>), // eslint-disable-line @typescript-eslint/no-explicit-any
  maybeBody?: (...args: any[]) => ExprProxy<R>, // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  const shouldThrow =
    typeof nameOrParams !== "string" ||
    typeof returnTypeOrBody === "function" ||
    typeof paramsOrReturnType === "string" ||
    !maybeBody;

  if (shouldThrow) {
    throw new Error(
      "Nameless fn(...) calls must be compiled by the shdr Vite transform. " +
        "Use a .shdr.ts file or pass an explicit name string.",
    );
  }

  const name = nameOrParams;
  const params = paramsOrReturnType;
  const returnType = returnTypeOrBody;
  const body = maybeBody;

  const statements: FnBodyStatement[] = [];
  const local$ = makeLocalContext(statements);

  if (isGlslTypeArray(params)) {
    // Auto-generate GLSL param names and typed proxies
    const paramSchema: Record<string, GlslType> = Object.fromEntries(
      params.map((t, i) => [`_p${i}`, t]),
    );
    const paramRefs = params.map((t, i) => refProxy([`_p${i}`], t));

    const returnValue = body(paramRefs, { $: local$, ...fnBuiltins });

    const def: FnDef = {
      name,
      params: paramSchema,
      returnType,
      body: statements,
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
    // }) as unknown as TupleShaderFn<readonly GlslType[], GlslType>;

    return attachFnMetadata(fn, def);
  } else {
    // ── Object form ─────────────────────────────────────────────────────────
    const paramRefs = Object.fromEntries(
      Object.entries(params).map(([key, type]) => [key, refProxy([key], type)]),
    );

    const returnValue = body(paramRefs, { $: local$, ...fnBuiltins });

    const def: FnDef = {
      name,
      params,
      returnType,
      body: statements,
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
    // }) as unknown as ShaderFn<Record<string, GlslType>, GlslType>;

    return attachFnMetadata(fn, def);
  }
}
