import { makeCall, glslTypeOf } from "./ast.ts";
import type { Expr, ExprProxy, GlslType } from "./types.ts";

type FloatArg = Expr<"float"> | number;

// ---------------------------------------------------------------------------
// Vector constructors
// ---------------------------------------------------------------------------

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

export function vec4(x: FloatArg, y: FloatArg, z: FloatArg, w: FloatArg): ExprProxy<"vec4">;
export function vec4(xyz: Expr<"vec3">, w: FloatArg): ExprProxy<"vec4">;
export function vec4(x: FloatArg, yzw: Expr<"vec3">): ExprProxy<"vec4">;
export function vec4(xy: Expr<"vec2">, zw: Expr<"vec2">): ExprProxy<"vec4">;
export function vec4(xy: Expr<"vec2">, z: FloatArg, w: FloatArg): ExprProxy<"vec4">;
export function vec4(x: FloatArg, yz: Expr<"vec2">, w: FloatArg): ExprProxy<"vec4">;
export function vec4(xyzw: FloatArg): ExprProxy<"vec4">;
export function vec4(...args: (FloatArg | Expr<"vec2"> | Expr<"vec3">)[]): ExprProxy<"vec4"> {
  return makeCall("vec4", args as (Expr<GlslType> | number)[], "vec4");
}

// mat2(col0, col1) — two vec2 columns
// mat2(m00, m01, m10, m11) — four floats, column-major
export function mat2(col0: Expr<"vec2">, col1: Expr<"vec2">): ExprProxy<"mat2">;
export function mat2(m00: FloatArg, m01: FloatArg, m10: FloatArg, m11: FloatArg): ExprProxy<"mat2">;
export function mat2(...args: (FloatArg | Expr<"vec2">)[]): ExprProxy<"mat2"> {
  return makeCall("mat2", args as (Expr<GlslType> | number)[], "mat2");
}

// ---------------------------------------------------------------------------
// Scalar/vector builtins (genType pattern — output type matches input type)
// ---------------------------------------------------------------------------

type ScalarBuiltin = {
  (x: FloatArg):     ExprProxy<"float">;
  (v: Expr<"vec2">): ExprProxy<"vec2">;
  (v: Expr<"vec3">): ExprProxy<"vec3">;
  (v: Expr<"vec4">): ExprProxy<"vec4">;
};

function makeScalarBuiltin(name: string): ScalarBuiltin {
  return ((arg: Expr<GlslType> | number) => {
    const argType: GlslType = typeof arg === "number" ? "float" : glslTypeOf(arg);
    return makeCall(name, [arg], argType);
  }) as unknown as ScalarBuiltin;
}

export const sin   = makeScalarBuiltin("sin");
export const cos   = makeScalarBuiltin("cos");
export const abs   = makeScalarBuiltin("abs");
export const fract = makeScalarBuiltin("fract");
export const sqrt  = makeScalarBuiltin("sqrt");
export const floor = makeScalarBuiltin("floor");

// ---------------------------------------------------------------------------
// Multi-arg builtins
// ---------------------------------------------------------------------------

export function mix<T extends "float" | "vec2" | "vec3" | "vec4">(
  a: Expr<T> | number, b: Expr<T> | number, t: FloatArg,
): ExprProxy<T> {
  const type: GlslType =
    typeof a !== "number" ? glslTypeOf(a) :
    typeof b !== "number" ? glslTypeOf(b) : "float";
  return makeCall<T>("mix", [a, b, t], type as T);
}

export function smoothstep(edge0: FloatArg, edge1: FloatArg, x: FloatArg): ExprProxy<"float"> {
  return makeCall("smoothstep", [edge0, edge1, x], "float");
}

export function radians(deg: FloatArg): ExprProxy<"float"> {
  return makeCall("radians", [deg], "float");
}

export function dot(
  a: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
  b: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall("dot", [a, b], "float");
}

export function length(v: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">): ExprProxy<"float"> {
  return makeCall("length", [v], "float");
}
