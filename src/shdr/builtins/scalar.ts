import { glslTypeOf, makeCall } from "../ast.ts";
import type { Expr, ExprProxy, GlslType } from "../types.ts";
import type { FloatArg } from "./types.ts";

type ScalarBuiltin = {
  (x: FloatArg): ExprProxy<"float">;
  (v: Expr<"vec2">): ExprProxy<"vec2">;
  (v: Expr<"vec3">): ExprProxy<"vec3">;
  (v: Expr<"vec4">): ExprProxy<"vec4">;
};

function makeScalarBuiltin(name: string) {
  return ((arg: Expr<GlslType> | number) => {
    const argType = typeof arg === "number" ? "float" : glslTypeOf(arg);
    return makeCall(name, [arg], argType);
  }) as ScalarBuiltin;
}

export const sin = makeScalarBuiltin("sin");
export const cos = makeScalarBuiltin("cos");
export const abs = makeScalarBuiltin("abs");
export const fract = makeScalarBuiltin("fract");
export const sqrt = makeScalarBuiltin("sqrt");
export const floor = makeScalarBuiltin("floor");
export const asin = makeScalarBuiltin("asin");
export const acos = makeScalarBuiltin("acos");
export const ceil = makeScalarBuiltin("ceil");
export const sign = makeScalarBuiltin("sign");
export const exp = makeScalarBuiltin("exp");
export const exp2 = makeScalarBuiltin("exp2");
export const log = makeScalarBuiltin("log");
export const log2 = makeScalarBuiltin("log2");
export const normalize = makeScalarBuiltin("normalize");
