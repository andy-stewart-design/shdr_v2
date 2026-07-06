import { makeCall } from "../ast.ts";
import type { Expr, ExprProxy } from "../types.ts";

export function dot(
  a: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
  b: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall("dot", [a, b], "float");
}

export function length(
  v: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall("length", [v], "float");
}

export function cross(a: Expr<"vec3">, b: Expr<"vec3">): ExprProxy<"vec3"> {
  return makeCall("cross", [a, b], "vec3");
}
