import { makeCall, makeProxy, glslTypeOf, toNode } from "./ast.ts";
import type { Expr, ExprProxy, GlslType } from "./types.ts";

type FloatArg = Expr<"float"> | number;
// type GenFloatType = "float" | "vec2" | "vec3" | "vec4";
type GenFloatExpr = Expr<"float"> | Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">;
// type GenFloatProxy =
//   | ExprProxy<"float">
//   | ExprProxy<"vec2">
//   | ExprProxy<"vec3">
//   | ExprProxy<"vec4">;

function genFloatTypeOf(value: GenFloatExpr | number) {
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

// ---------------------------------------------------------------------------
// Scalar / vector constructors
// ---------------------------------------------------------------------------

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

// mat2(col0, col1) — two vec2 columns
// mat2(m00, m01, m10, m11) — four floats, column-major
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

// ---------------------------------------------------------------------------
// Scalar/vector builtins (genType pattern — output type matches input type)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Multi-arg builtins
// ---------------------------------------------------------------------------

export function mix<T extends "float" | "vec2" | "vec3" | "vec4">(
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

export function smoothstep(
  edge0: FloatArg,
  edge1: FloatArg,
  x: FloatArg,
): ExprProxy<"float">;
export function smoothstep(
  edge0: Expr<"vec2"> | FloatArg,
  edge1: Expr<"vec2"> | FloatArg,
  x: Expr<"vec2">,
): ExprProxy<"vec2">;
export function smoothstep(
  edge0: Expr<"vec3"> | FloatArg,
  edge1: Expr<"vec3"> | FloatArg,
  x: Expr<"vec3">,
): ExprProxy<"vec3">;
export function smoothstep(
  edge0: Expr<"vec4"> | FloatArg,
  edge1: Expr<"vec4"> | FloatArg,
  x: Expr<"vec4">,
): ExprProxy<"vec4">;
export function smoothstep(
  edge0: GenFloatExpr | number,
  edge1: GenFloatExpr | number,
  x: GenFloatExpr | number,
) {
  const args = [edge0, edge1, x];
  const type = genFloatTypeOf(x);

  if (type === "float") return makeCall("smoothstep", args, "float");
  if (type === "vec2") return makeCall("smoothstep", args, "vec2");
  if (type === "vec3") return makeCall("smoothstep", args, "vec3");
  if (type === "vec4") return makeCall("smoothstep", args, "vec4");
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

export function length(
  v: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall("length", [v], "float");
}

// atan — one-arg (arctan) or two-arg (atan2)
export function atan(x: FloatArg): ExprProxy<"float">;
export function atan<T extends "float" | "vec2" | "vec3" | "vec4">(
  x: Expr<T>,
): ExprProxy<T>;
export function atan(y: FloatArg, x: FloatArg): ExprProxy<"float">;
export function atan<T extends "float" | "vec2" | "vec3" | "vec4">(
  y: Expr<T>,
  x: Expr<T> | FloatArg,
): ExprProxy<T>;
export function atan(a: any, b?: any): any {
  if (b === undefined) {
    const type: GlslType = typeof a === "number" ? "float" : glslTypeOf(a);
    return makeCall("atan", [a], type);
  }
  const type: GlslType =
    typeof a === "number"
      ? typeof b === "number"
        ? "float"
        : glslTypeOf(b)
      : glslTypeOf(a);
  return makeCall("atan", [a, b], type);
}

// step — step(edge, x): result type matches x
export function step(edge: FloatArg, x: FloatArg): ExprProxy<"float">;
export function step<T extends "float" | "vec2" | "vec3" | "vec4">(
  edge: FloatArg,
  x: Expr<T>,
): ExprProxy<T>;
export function step<T extends "float" | "vec2" | "vec3" | "vec4">(
  edge: Expr<T>,
  x: Expr<T>,
): ExprProxy<T>;
export function step(edge: any, x: any): any {
  const type: GlslType = typeof x === "number" ? "float" : glslTypeOf(x);
  return makeCall("step", [edge, x], type);
}

// mod — mod(x, y): result type matches x
export function mod(x: FloatArg, y: FloatArg): ExprProxy<"float">;
export function mod<T extends "float" | "vec2" | "vec3" | "vec4">(
  x: Expr<T>,
  y: Expr<T> | FloatArg,
): ExprProxy<T>;
export function mod(x: any, y: any): any {
  const type: GlslType = typeof x === "number" ? "float" : glslTypeOf(x);
  return makeCall("mod", [x, y], type);
}

// min / max — result type matches first arg
export function min(x: FloatArg, y: FloatArg): ExprProxy<"float">;
export function min<T extends "float" | "vec2" | "vec3" | "vec4">(
  x: Expr<T>,
  y: Expr<T> | FloatArg,
): ExprProxy<T>;
export function min(x: any, y: any): any {
  const type: GlslType =
    typeof x === "number"
      ? typeof y === "number"
        ? "float"
        : glslTypeOf(y)
      : glslTypeOf(x);
  return makeCall("min", [x, y], type);
}

export function max(x: FloatArg, y: FloatArg): ExprProxy<"float">;
export function max<T extends "float" | "vec2" | "vec3" | "vec4">(
  x: Expr<T>,
  y: Expr<T> | FloatArg,
): ExprProxy<T>;
export function max(x: any, y: any): any {
  const type: GlslType =
    typeof x === "number"
      ? typeof y === "number"
        ? "float"
        : glslTypeOf(y)
      : glslTypeOf(x);
  return makeCall("max", [x, y], type);
}

// clamp(x, min, max) — result type matches x
export function clamp(
  x: FloatArg,
  minVal: FloatArg,
  maxVal: FloatArg,
): ExprProxy<"float">;
export function clamp<T extends "float" | "vec2" | "vec3" | "vec4">(
  x: Expr<T>,
  minVal: Expr<T> | FloatArg,
  maxVal: Expr<T> | FloatArg,
): ExprProxy<T>;
export function clamp(x: any, minVal: any, maxVal: any): any {
  const type: GlslType = typeof x === "number" ? "float" : glslTypeOf(x);
  return makeCall("clamp", [x, minVal, maxVal], type);
}

// pow(x, y) — result type matches x
export function pow(x: FloatArg, y: FloatArg): ExprProxy<"float">;
export function pow<T extends "float" | "vec2" | "vec3" | "vec4">(
  x: Expr<T>,
  y: Expr<T> | FloatArg,
): ExprProxy<T>;
export function pow(x: any, y: any): any {
  const type: GlslType = typeof x === "number" ? "float" : glslTypeOf(x);
  return makeCall("pow", [x, y], type);
}

// mix with bool mask (GLSL ES 3.00 extension, takes bvec)
// Omitted for now — requires bool type support

// cross product — vec3 only
export function cross(a: Expr<"vec3">, b: Expr<"vec3">): ExprProxy<"vec3"> {
  return makeCall("cross", [a, b], "vec3");
}

// reflect(I, N) — genType
export function reflect(I: FloatArg, N: FloatArg): ExprProxy<"float">;
export function reflect<T extends "float" | "vec2" | "vec3" | "vec4">(
  I: Expr<T>,
  N: Expr<T>,
): ExprProxy<T>;
export function reflect(I: any, N: any): any {
  const type: GlslType = typeof I === "number" ? "float" : glslTypeOf(I);
  return makeCall("reflect", [I, N], type);
}

// ---------------------------------------------------------------------------
// Texture sampling
// ---------------------------------------------------------------------------

export function texture(
  sampler: Expr<"sampler2D">,
  uv: Expr<"vec2">,
): ExprProxy<"vec4"> {
  return makeCall("texture", [sampler, uv], "vec4");
}

// ---------------------------------------------------------------------------
// Standalone arithmetic operators
//
// Mirror the chainable methods on ExprProxy but callable as free functions,
// so plain numbers can be used without a proxy as the receiver:
//
//   mul(1.5, 0.5)              // (1.5 * 0.5)  — both numbers
//   add(tuv.x, distX)          // (tuv.x + distX)
//   mul(WAVE_FREQ, WAVE_SCALE) // (WAVE_FREQ * WAVE_SCALE)
// ---------------------------------------------------------------------------

type AnyArg = Expr<GlslType> | number;

function inferType(a: AnyArg, b: AnyArg): GlslType {
  if (typeof a !== "number") return glslTypeOf(a);
  if (typeof b !== "number") return glslTypeOf(b);
  return "float";
}

function binop(
  op: "+" | "-" | "*" | "/",
  a: AnyArg,
  b: AnyArg,
  type: GlslType,
): ExprProxy<GlslType> {
  return makeProxy(
    { kind: "binop", op, left: toNode(a), right: toNode(b) },
    type,
  );
}

// add
export function add(a: number, b: number): ExprProxy<"float">;
export function add<T extends GlslType>(
  a: Expr<T>,
  b: Expr<T> | number,
): ExprProxy<T>;
export function add<T extends GlslType>(a: number, b: Expr<T>): ExprProxy<T>;
export function add<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<"float">,
  b: Expr<T>,
): ExprProxy<T>;
export function add<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<T>,
  b: Expr<"float">,
): ExprProxy<T>;
export function add(a: any, b: any): any {
  return binop(
    "+",
    a as AnyArg,
    b as AnyArg,
    inferType(a as AnyArg, b as AnyArg),
  );
}

// sub
export function sub(a: number, b: number): ExprProxy<"float">;
export function sub<T extends GlslType>(
  a: Expr<T>,
  b: Expr<T> | number,
): ExprProxy<T>;
export function sub<T extends GlslType>(a: number, b: Expr<T>): ExprProxy<T>;
export function sub<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<"float">,
  b: Expr<T>,
): ExprProxy<T>;
export function sub<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<T>,
  b: Expr<"float">,
): ExprProxy<T>;
export function sub(a: any, b: any): any {
  return binop(
    "-",
    a as AnyArg,
    b as AnyArg,
    inferType(a as AnyArg, b as AnyArg),
  );
}

// mul — includes mat2*vec2 and vec2*mat2 → vec2
export function mul(a: number, b: number): ExprProxy<"float">;
export function mul(a: Expr<"mat2">, b: Expr<"vec2">): ExprProxy<"vec2">;
export function mul(a: Expr<"vec2">, b: Expr<"mat2">): ExprProxy<"vec2">;
export function mul<T extends GlslType>(
  a: Expr<T>,
  b: Expr<T> | number,
): ExprProxy<T>;
export function mul<T extends GlslType>(a: number, b: Expr<T>): ExprProxy<T>;
export function mul<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<"float">,
  b: Expr<T>,
): ExprProxy<T>;
export function mul<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<T>,
  b: Expr<"float">,
): ExprProxy<T>;
export function mul(a: any, b: any): any {
  const ta = typeof a === "number" ? "float" : glslTypeOf(a as Expr<GlslType>);
  const tb = typeof b === "number" ? "float" : glslTypeOf(b as Expr<GlslType>);
  const type: GlslType =
    (ta === "mat2" && tb === "vec2") || (ta === "vec2" && tb === "mat2")
      ? "vec2"
      : inferType(a as AnyArg, b as AnyArg);
  return binop("*", a as AnyArg, b as AnyArg, type);
}

// div
export function div(a: number, b: number): ExprProxy<"float">;
export function div<T extends GlslType>(
  a: Expr<T>,
  b: Expr<T> | number,
): ExprProxy<T>;
export function div<T extends GlslType>(a: number, b: Expr<T>): ExprProxy<T>;
export function div<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<"float">,
  b: Expr<T>,
): ExprProxy<T>;
export function div<T extends "vec2" | "vec3" | "vec4">(
  a: Expr<T>,
  b: Expr<"float">,
): ExprProxy<T>;
export function div(a: any, b: any): any {
  return binop(
    "/",
    a as AnyArg,
    b as AnyArg,
    inferType(a as AnyArg, b as AnyArg),
  );
}

// neg (unary)
export function neg(a: number): ExprProxy<"float">;
export function neg<T extends GlslType>(a: Expr<T>): ExprProxy<T>;
export function neg(a: any): any {
  const arg = a as AnyArg;
  const type = typeof arg === "number" ? "float" : glslTypeOf(arg);
  return makeProxy({ kind: "unary", op: "-", operand: toNode(arg) }, type);
}
