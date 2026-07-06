import { glslTypeOf, makeProxy, toNode } from "../ast.ts";
import type { ExprProxy, GlslType } from "../types.ts";
import type {
  AnyArg,
  ArithmeticResult,
  MulResult,
  TypeOfValue,
} from "./types.ts";

function inferType(a: AnyArg, b: AnyArg): GlslType {
  if (typeof a !== "number") return glslTypeOf(a);
  if (typeof b !== "number") return glslTypeOf(b);
  return "float";
}

function inferMulType(a: AnyArg, b: AnyArg): GlslType {
  const ta = typeof a === "number" ? "float" : glslTypeOf(a);
  const tb = typeof b === "number" ? "float" : glslTypeOf(b);
  return (ta === "mat2" && tb === "vec2") || (ta === "vec2" && tb === "mat2")
    ? "vec2"
    : inferType(a, b);
}

function binop<T extends GlslType>(
  op: "+" | "-" | "*" | "/",
  a: AnyArg,
  b: AnyArg,
  type: T,
): ExprProxy<T> {
  return makeProxy(
    { kind: "binop", op, left: toNode(a), right: toNode(b) },
    type,
  );
}

function arithmeticBinop<
  A extends AnyArg,
  B extends AnyArg,
  R extends GlslType,
>(op: "+" | "-" | "*" | "/", a: A, b: B, type: GlslType): ExprProxy<R> {
  return binop(op, a, b, type) as unknown as ExprProxy<R>;
}

export function add<A extends AnyArg, B extends AnyArg>(
  a: A,
  b: B,
): ExprProxy<ArithmeticResult<A, B>> {
  return arithmeticBinop<A, B, ArithmeticResult<A, B>>(
    "+",
    a,
    b,
    inferType(a, b),
  );
}

export function sub<A extends AnyArg, B extends AnyArg>(
  a: A,
  b: B,
): ExprProxy<ArithmeticResult<A, B>> {
  return arithmeticBinop<A, B, ArithmeticResult<A, B>>(
    "-",
    a,
    b,
    inferType(a, b),
  );
}

export function mul<A extends AnyArg, B extends AnyArg>(
  a: A,
  b: B,
): ExprProxy<MulResult<A, B>> {
  return arithmeticBinop<A, B, MulResult<A, B>>("*", a, b, inferMulType(a, b));
}

export function div<A extends AnyArg, B extends AnyArg>(
  a: A,
  b: B,
): ExprProxy<ArithmeticResult<A, B>> {
  return arithmeticBinop<A, B, ArithmeticResult<A, B>>(
    "/",
    a,
    b,
    inferType(a, b),
  );
}

export function neg<A extends AnyArg>(a: A): ExprProxy<TypeOfValue<A>> {
  const type = typeof a === "number" ? "float" : glslTypeOf(a);
  return makeProxy(
    { kind: "unary", op: "-", operand: toNode(a) },
    type,
  ) as unknown as ExprProxy<TypeOfValue<A>>;
}
