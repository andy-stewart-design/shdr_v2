import type { NODE, GLSL_TYPE } from "./ast.ts";

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export type NumberNode = { kind: "number"; value: number };
export type RefNode    = { kind: "ref";    path: string[] };
export type CallNode   = { kind: "call";   name: string; args: AstNode[] };
export type FieldNode  = { kind: "field";  expr: AstNode; field: string };
export type BinOpNode  = { kind: "binop";  op: "+" | "-" | "*" | "/"; left: AstNode; right: AstNode };
export type UnaryNode  = { kind: "unary";  op: "-"; operand: AstNode };

export type AstNode = NumberNode | RefNode | CallNode | FieldNode | BinOpNode | UnaryNode;

// ---------------------------------------------------------------------------
// GLSL type universe
// ---------------------------------------------------------------------------

export type GlslType = "float" | "vec2" | "vec3" | "vec4" | "mat2";

export type Channels<T extends GlslType> =
  T extends "float" ? never :
  T extends "vec2"  ? "x" | "y" | "r" | "g" :
  T extends "vec3"  ? "x" | "y" | "z" | "r" | "g" | "b" :
  T extends "vec4"  ? "x" | "y" | "z" | "w" | "r" | "g" | "b" | "a" :
  never; // mat2 has no swizzle channels

// ---------------------------------------------------------------------------
// Expr<T> — phantom-typed handle over an AstNode
// ---------------------------------------------------------------------------

export type Expr<T extends GlslType> = {
  readonly [NODE]: AstNode;
  readonly [GLSL_TYPE]: T;
};

// ---------------------------------------------------------------------------
// Arithmetic method interfaces
// ---------------------------------------------------------------------------

export type ArithmeticMethods<T extends GlslType> = {
  /** (a + b) */ add(other: Expr<T> | number): ExprProxy<T>;
  /** (a - b) */ sub(other: Expr<T> | number): ExprProxy<T>;
  /** (a * b) */ mul(other: Expr<T> | number): ExprProxy<T>;
  /** (a / b) */ div(other: Expr<T> | number): ExprProxy<T>;
  /** (-a)    */ neg(): ExprProxy<T>;
};

// mat2 * vec2 → vec2 changes the output type, so mat2 gets its own interface.
export type Mat2Methods = {
  mul(other: Expr<"vec2">):          ExprProxy<"vec2">;
  mul(other: Expr<"mat2"> | number): ExprProxy<"mat2">;
  add(other: Expr<"mat2">):          ExprProxy<"mat2">;
  sub(other: Expr<"mat2">):          ExprProxy<"mat2">;
  neg():                             ExprProxy<"mat2">;
};

// ---------------------------------------------------------------------------
// ExprProxy<T> — Expr with typed swizzle + chainable arithmetic
// ---------------------------------------------------------------------------

export type SwizzleProps<T extends GlslType> = {
  readonly [K in Channels<T>]: ExprProxy<"float">;
} & {
  readonly [K in `${Channels<T>}${Channels<T>}`]: ExprProxy<"vec2">;
} & {
  readonly [K in T extends "vec3" | "vec4"
    ? `${Channels<T>}${Channels<T>}${Channels<T>}`
    : never]: ExprProxy<"vec3">;
} & {
  readonly [K in T extends "vec4"
    ? `${Channels<T>}${Channels<T>}${Channels<T>}${Channels<T>}`
    : never]: ExprProxy<"vec4">;
};

export type ExprProxy<T extends GlslType> =
  Expr<T> & SwizzleProps<T> & (T extends "mat2" ? Mat2Methods : ArithmeticMethods<T>);

// ---------------------------------------------------------------------------
// ShaderContext — the $ object exposed to the fragment function
// ---------------------------------------------------------------------------

export type ShaderContext = {
  /** Declare a named local variable. */
  let<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  /** Declare an auto-named local variable (_v0, _v1, …). */
  let<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
  /** Declare a top-level GLSL constant (emitted before main). */
  const<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  const(name: string, value: number): ExprProxy<"float">;
  /** Write to gl_FragColor — must be vec4. */
  fragColor(value: Expr<"vec4">): void;
  /** Interpolated UV coord in [0,1]². */
  readonly uv: ExprProxy<"vec2">;
  /** Elapsed time in seconds (u_time uniform). */
  readonly time: ExprProxy<"float">;
};
