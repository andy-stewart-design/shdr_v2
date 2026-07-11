import { makeCall } from "../ast.ts";
import type { Expr, ExprProxy, GlslType } from "../types.ts";
import type { FloatArg } from "./types.ts";

export function float(x: FloatArg): ExprProxy<"float"> {
  return makeCall("float", [x], "float");
}

export function vec2(x: FloatArg, y: FloatArg): ExprProxy<"vec2">;
export function vec2(xy: FloatArg): ExprProxy<"vec2">;
export function vec2(...args: FloatArg[]): ExprProxy<"vec2"> {
  return makeCall("vec2", args, "vec2");
}

export function vec3(x: FloatArg, y: FloatArg, z: FloatArg): ExprProxy<"vec3">;
export function vec3(xy: Expr<"vec2">, z: FloatArg): ExprProxy<"vec3">;
export function vec3(x: FloatArg, yz: Expr<"vec2">): ExprProxy<"vec3">;
export function vec3(xyz: FloatArg): ExprProxy<"vec3">;
export function vec3(...args: (FloatArg | Expr<"vec2">)[]): ExprProxy<"vec3"> {
  return makeCall("vec3", args as (Expr<GlslType> | number)[], "vec3");
}

export function vec4(
  x: FloatArg,
  y: FloatArg,
  z: FloatArg,
  w: FloatArg,
): ExprProxy<"vec4">;
export function vec4(xyz: Expr<"vec3">, w: FloatArg): ExprProxy<"vec4">;
export function vec4(x: FloatArg, yzw: Expr<"vec3">): ExprProxy<"vec4">;
export function vec4(xy: Expr<"vec2">, zw: Expr<"vec2">): ExprProxy<"vec4">;
export function vec4(
  xy: Expr<"vec2">,
  z: FloatArg,
  w: FloatArg,
): ExprProxy<"vec4">;
export function vec4(
  x: FloatArg,
  yz: Expr<"vec2">,
  w: FloatArg,
): ExprProxy<"vec4">;
export function vec4(xyzw: FloatArg): ExprProxy<"vec4">;
export function vec4(
  ...args: (FloatArg | Expr<"vec2"> | Expr<"vec3">)[]
): ExprProxy<"vec4"> {
  return makeCall("vec4", args as (Expr<GlslType> | number)[], "vec4");
}

export function mat2(col0: Expr<"vec2">, col1: Expr<"vec2">): ExprProxy<"mat2">;
export function mat2(
  m00: FloatArg,
  m01: FloatArg,
  m10: FloatArg,
  m11: FloatArg,
): ExprProxy<"mat2">;
export function mat2(...args: (FloatArg | Expr<"vec2">)[]): ExprProxy<"mat2"> {
  return makeCall("mat2", args as (Expr<GlslType> | number)[], "mat2");
}
