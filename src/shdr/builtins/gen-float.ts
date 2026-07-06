import { glslTypeOf, makeCall } from "../ast.ts";
import type { Expr, ExprProxy } from "../types.ts";
import type {
  FloatArg,
  GenFloatArg,
  GenFloatType,
  GenFloatTypeOf,
  GenFloatValue,
  PromotedGenFloat,
  ScalarCompatible,
} from "./types.ts";
import { genFloatCall, genFloatTypeOf, promotedGenFloatType } from "./types.ts";

export function mix<T extends GenFloatType>(
  a: Expr<T> | number,
  b: Expr<T> | number,
  t: FloatArg,
) {
  const type =
    typeof a !== "number"
      ? glslTypeOf(a)
      : typeof b !== "number"
        ? glslTypeOf(b)
        : "float";
  return makeCall<T>("mix", [a, b, t], type as T);
}

export function smoothstep<T extends GenFloatType>(
  edge0: ScalarCompatible<NoInfer<T>>,
  edge1: ScalarCompatible<NoInfer<T>>,
  x: GenFloatArg<T>,
): ExprProxy<T> {
  return genFloatCall("smoothstep", [edge0, edge1, x], genFloatTypeOf(x) as T);
}

export function radians(deg: FloatArg): ExprProxy<"float"> {
  return makeCall("radians", [deg], "float");
}

// atan — one-arg (arctan) or two-arg (atan2)
type AtanArgs = [GenFloatValue] | [GenFloatValue, GenFloatValue];
type AtanReturn<A extends AtanArgs> = A extends [infer X]
  ? GenFloatTypeOf<X>
  : A extends [infer Y, infer X]
    ? PromotedGenFloat<Y, X>
    : never;

export function atan<const A extends AtanArgs>(
  ...args: A
): ExprProxy<AtanReturn<A>> {
  const type =
    args.length === 1
      ? genFloatTypeOf(args[0])
      : promotedGenFloatType(args[0], args[1]);
  return genFloatCall("atan", args, type) as unknown as ExprProxy<
    AtanReturn<A>
  >;
}

export function step<T extends GenFloatType>(
  edge: ScalarCompatible<NoInfer<T>>,
  x: GenFloatArg<T>,
): ExprProxy<T> {
  return genFloatCall("step", [edge, x], genFloatTypeOf(x) as T);
}

export function mod<T extends GenFloatType>(
  x: GenFloatArg<T>,
  y: ScalarCompatible<NoInfer<T>>,
): ExprProxy<T> {
  return genFloatCall("mod", [x, y], genFloatTypeOf(x) as T);
}

export function min<A extends GenFloatValue, B extends GenFloatValue>(
  x: A,
  y: B,
): ExprProxy<PromotedGenFloat<A, B>> {
  return genFloatCall(
    "min",
    [x, y],
    promotedGenFloatType(x, y),
  ) as unknown as ExprProxy<PromotedGenFloat<A, B>>;
}

export function max<A extends GenFloatValue, B extends GenFloatValue>(
  x: A,
  y: B,
): ExprProxy<PromotedGenFloat<A, B>> {
  return genFloatCall(
    "max",
    [x, y],
    promotedGenFloatType(x, y),
  ) as unknown as ExprProxy<PromotedGenFloat<A, B>>;
}

export function clamp<T extends GenFloatType>(
  x: GenFloatArg<T>,
  minVal: ScalarCompatible<NoInfer<T>>,
  maxVal: ScalarCompatible<NoInfer<T>>,
): ExprProxy<T> {
  return genFloatCall("clamp", [x, minVal, maxVal], genFloatTypeOf(x) as T);
}

export function pow<T extends GenFloatType>(
  x: GenFloatArg<T>,
  y: ScalarCompatible<NoInfer<T>>,
): ExprProxy<T> {
  return genFloatCall("pow", [x, y], genFloatTypeOf(x) as T);
}

export function reflect<T extends GenFloatType>(
  I: GenFloatArg<T>,
  N: GenFloatArg<T>,
): ExprProxy<T> {
  return genFloatCall("reflect", [I, N], genFloatTypeOf(I) as T);
}
