import { glslTypeOf, makeCall } from "../ast.ts";
import type { Expr, ExprProxy, GlslType } from "../types.ts";

export type FloatArg = Expr<"float"> | number;

export type GenFloatType = "float" | "vec2" | "vec3" | "vec4";
export type GenFloatExpr<T extends GenFloatType = GenFloatType> = Expr<T>;
export type GenFloatArg<T extends GenFloatType> = T extends "float"
  ? Expr<"float"> | number
  : Expr<T>;
export type ScalarCompatible<T extends GenFloatType> =
  GenFloatArg<T> | FloatArg;
export type GenFloatValue = GenFloatExpr | number;
export type GenFloatTypeOf<A> = A extends number
  ? "float"
  : A extends Expr<infer T>
    ? Extract<T, GenFloatType>
    : never;
export type PromotedGenFloat<A, B> =
  GenFloatTypeOf<A> extends "float" ? GenFloatTypeOf<B> : GenFloatTypeOf<A>;

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

export function promotedGenFloatType(
  a: GenFloatValue,
  b: GenFloatValue,
): GenFloatType {
  return typeof a === "number" ? genFloatTypeOf(b) : genFloatTypeOf(a);
}

export function genFloatCall<T extends GenFloatType>(
  name: string,
  args: GenFloatValue[],
  type: T,
): ExprProxy<T> {
  return makeCall(name, args, type);
}

export type AnyArg = Expr<GlslType> | number;
export type TypeOfValue<A> = A extends number
  ? "float"
  : A extends Expr<infer T>
    ? T
    : never;
export type ArithmeticResult<A, B> =
  TypeOfValue<A> extends "float"
    ? TypeOfValue<B>
    : TypeOfValue<B> extends "float"
      ? TypeOfValue<A>
      : TypeOfValue<A>;
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
