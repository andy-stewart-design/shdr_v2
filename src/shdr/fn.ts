import { NODE, makeProxy, refProxy, toNode, glslTypeOf } from "./ast.ts";
import { compileFn } from "./compile.ts";
import {
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
} from "./builtins.ts";
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
      statements.push({
        type: "let",
        name,
        varType: glslTypeOf(value),
        value: toNode(value),
      });
      return refProxy<T>([name], glslTypeOf(value) as T);
    },
  };
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

// Array form — put first so TS resolves it before the object form
export function fn<T extends readonly GlslType[], R extends GlslType>(
  name: string,
  params: readonly [...T],
  returnType: R,
  body: (args: TupleToExprs<T>, ctx: FnContext) => ExprProxy<R>,
): TupleShaderFn<T, R>;

// Object form
export function fn<S extends Record<string, GlslType>, R extends GlslType>(
  name: string,
  params: S,
  returnType: R,
  body: (args: ParamsToExprs<S>, ctx: FnContext) => ExprProxy<R>,
): ShaderFn<S, R>;

// Implementation — body typed as (...args: any[]) => ... to satisfy both overloads
export function fn<R extends GlslType>(
  name: string,
  params: ReadonlyArray<GlslType> | Record<string, GlslType>,
  returnType: R,
  body: (...args: any[]) => ExprProxy<R>, // eslint-disable-line @typescript-eslint/no-explicit-any
): unknown {
  const statements: FnBodyStatement[] = [];
  const local$ = makeLocalContext(statements);

  if (Array.isArray(params)) {
    // ── Array form ──────────────────────────────────────────────────────────
    const types = params as readonly GlslType[];

    // Auto-generate GLSL param names and typed proxies
    const paramSchema: Record<string, GlslType> = Object.fromEntries(
      types.map((t, i) => [`_p${i}`, t]),
    );
    const paramRefs = types.map((t, i) => refProxy([`_p${i}`], t));

    const returnValue = body(paramRefs, { $: local$, ...fnBuiltins });

    const def: FnDef = {
      name,
      params: paramSchema,
      returnType,
      body: statements,
      returnExpr: toNode(returnValue),
    };

    const fn = ((...args: (ExprProxy<GlslType> | number)[]) => {
      // Guard: if the first arg is a plain object (not an ExprProxy, not a number),
      // the caller used named syntax rot({ a }) instead of positional rot(a).
      if (
        args.length > 0 &&
        args[0] !== null &&
        typeof args[0] === "object" &&
        !(NODE in (args[0] as object))
      ) {
        throw new Error(
          `fn '${name}' was defined with positional params [${types.join(", ")}] ` +
            `but called with a named-args object. Use ${name}(${types.map((_, i) => `arg${i}`).join(", ")}) instead.`,
        );
      }
      const argNodes: AstNode[] = args.map((a) => toNode(a));
      return makeProxy({ kind: "fncall", def, args: argNodes }, returnType);
    }) as unknown as TupleShaderFn<readonly GlslType[], GlslType>;

    Object.defineProperty(fn, "_def", { value: def, writable: false });
    Object.defineProperty(fn, "glsl", {
      get: () => compileFn(fn as { _def: typeof def }),
      enumerable: true,
    });
    return fn;
  } else {
    // ── Object form ─────────────────────────────────────────────────────────
    const schema = params as Record<string, GlslType>;

    const paramRefs = Object.fromEntries(
      Object.entries(schema).map(([key, type]) => [key, refProxy([key], type)]),
    );

    const returnValue = body(paramRefs, { $: local$, ...fnBuiltins });

    const def: FnDef = {
      name,
      params: schema,
      returnType,
      body: statements,
      returnExpr: toNode(returnValue),
    };

    const fn = ((args: Record<string, ExprProxy<GlslType> | number>) => {
      // Guard: if args is an ExprProxy (has NODE symbol), the caller used
      // positional syntax rot(angle) instead of named rot({ a: angle }).
      // Without strict TS this silently passes but causes a bad swizzle in GLSL.
      if (
        args !== null &&
        typeof args === "object" &&
        NODE in (args as object)
      ) {
        throw new Error(
          `fn '${name}' was defined with named params { ${Object.keys(schema).join(", ")} } ` +
            `but called with positional arguments. Use ${name}({ ${Object.keys(
              schema,
            )
              .map((k, i) => `${k}: arg${i}`)
              .join(", ")} }) instead.`,
        );
      }
      const argNodes: AstNode[] = Object.keys(schema).map((k) =>
        toNode(args[k]),
      );
      return makeProxy({ kind: "fncall", def, args: argNodes }, returnType);
    }) as unknown as ShaderFn<Record<string, GlslType>, GlslType>;

    Object.defineProperty(fn, "_def", { value: def, writable: false });
    Object.defineProperty(fn, "glsl", {
      get: () => compileFn(fn as { _def: typeof def }),
      enumerable: true,
    });
    return fn;
  }
}
