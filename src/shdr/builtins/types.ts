import { glslTypeOf, makeCall } from "../ast.ts";
import type { Expr, ExprProxy, GlslType } from "../types.ts";

// ---------------------------------------------------------------------------
// Shared scalar / gen-float builtin types
// ---------------------------------------------------------------------------

/**
 * A GLSL float argument in the DSL.
 *
 * Bare JS numbers are accepted as float literals, so most places that accept an
 * Expr<"float"> also accept number.
 */
export type FloatArg = Expr<"float"> | number;

/**
 * GLSL's "genType" float family: float plus float vectors.
 *
 * This intentionally excludes matrices, samplers, bools, ints, etc. It is the
 * type universe used by functions like sin, smoothstep, min, pow, reflect, ...
 */
export type GenFloatType = "float" | "vec2" | "vec3" | "vec4";

/** An expression whose type is one of the gen-float types. */
export type GenFloatExpr<T extends GenFloatType = GenFloatType> = Expr<T>;

/**
 * User-facing argument for a specific gen-float type.
 *
 * For T="float", allow either an Expr<"float"> or a bare number literal.
 * For vector T, require the matching vector expression; a bare number by itself
 * cannot stand in for an entire vecN argument.
 */
export type GenFloatArg<T extends GenFloatType> = T extends "float"
  ? Expr<"float"> | number
  : Expr<T>;

/**
 * Argument compatible with a gen-float operation of result type T.
 *
 * Used for GLSL overloads that allow either the same type as the primary arg or
 * a scalar float, e.g. smoothstep(float, float, vec3) -> vec3 or
 * pow(vec3, float) -> vec3.
 */
export type ScalarCompatible<T extends GenFloatType> =
  GenFloatArg<T> | FloatArg;

/** Runtime value accepted by generic float/vector builtins. */
export type GenFloatValue = GenFloatExpr | number;

/**
 * Type-level equivalent of genFloatTypeOf(...).
 *
 * Maps a TypeScript argument type to its GLSL gen-float type:
 *   number       -> "float"
 *   Expr<"vec3"> -> "vec3"
 *
 * Extract<> protects callers from accidentally widening beyond GenFloatType.
 */
export type GenFloatTypeOf<A> = A extends number
  ? "float"
  : A extends Expr<infer T>
    ? Extract<T, GenFloatType>
    : never;

/**
 * Type-level promotion rule for binary gen-float functions where either side may
 * provide the vector type.
 *
 * If the first arg is scalar, use the second arg's type; otherwise use the first
 * arg's type. This models helpers like min(number, vec2) -> vec2 while keeping
 * min(vec2, number) -> vec2 and min(number, number) -> float.
 */
export type PromotedGenFloat<A, B> =
  GenFloatTypeOf<A> extends "float" ? GenFloatTypeOf<B> : GenFloatTypeOf<A>;

/** Runtime GLSL type lookup for a GenFloatValue. */
export function genFloatTypeOf(value: GenFloatValue): GenFloatType {
  if (typeof value === "number") return "float";

  const type = glslTypeOf(value);
  switch (type) {
    case "float":
    case "vec2":
    case "vec3":
    case "vec4":
      return type;
    case "mat2":
    case "sampler2D":
      throw new Error(`Expected float/vector expression, got ${type}`);
  }
}

/** Runtime equivalent of PromotedGenFloat<A, B>. */
export function promotedGenFloatType(
  a: GenFloatValue,
  b: GenFloatValue,
): GenFloatType {
  return typeof a === "number" ? genFloatTypeOf(b) : genFloatTypeOf(a);
}

/**
 * Small typed wrapper around makeCall for gen-float builtins.
 *
 * Keeps the repeated casts and GenFloatValue[] plumbing out of each builtin
 * implementation.
 */
export function genFloatCall<T extends GenFloatType>(
  name: string,
  args: GenFloatValue[],
  type: T,
): ExprProxy<T> {
  return makeCall(name, args, type);
}

// ---------------------------------------------------------------------------
// Shared arithmetic free-function types
// ---------------------------------------------------------------------------

/** Any value accepted by standalone arithmetic helpers add/sub/mul/div/neg. */
export type AnyArg = Expr<GlslType> | number;

/**
 * Type-level GLSL type lookup for arithmetic arguments.
 *
 * Unlike GenFloatTypeOf, this covers the full current GlslType universe because
 * arithmetic also supports mat2 and sampler2D is represented in GlslType even
 * though sampler arithmetic is not a meaningful operation.
 */
export type TypeOfValue<A> = A extends number
  ? "float"
  : A extends Expr<infer T>
    ? T
    : never;

/**
 * Result type for add/sub/div and the ordinary cases of mul.
 *
 * Rules:
 *   number + number     -> float
 *   vecN   + number     -> vecN
 *   number + vecN       -> vecN
 *   float-expression with vecN -> vecN
 *   same-type operands  -> that type
 *
 * This mirrors the ergonomic scalar-broadcasting behavior used by the DSL.
 */
export type ArithmeticResult<A, B> =
  TypeOfValue<A> extends "float"
    ? TypeOfValue<B>
    : TypeOfValue<B> extends "float"
      ? TypeOfValue<A>
      : TypeOfValue<A>;

/**
 * Result type for mul, including matrix/vector special cases.
 *
 * In addition to ArithmeticResult's scalar-broadcasting behavior:
 *   mat2 * vec2 -> vec2
 *   vec2 * mat2 -> vec2
 *
 * Other mat2 multiplication currently preserves mat2 via the existing DSL rule.
 */
export type MulResult<A, B> =
  TypeOfValue<A> extends "mat2"
    ? TypeOfValue<B> extends "vec2"
      ? "vec2"
      : "mat2"
    : TypeOfValue<A> extends "vec2"
      ? TypeOfValue<B> extends "mat2"
        ? "vec2"
        : ArithmeticResult<A, B>
      : ArithmeticResult<A, B>;
