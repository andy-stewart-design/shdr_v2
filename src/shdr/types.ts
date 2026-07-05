import type { NODE, GLSL_TYPE } from "./ast.ts";
import type { UniformMap, UniformSchema } from "./uniform.ts";

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

export type NumberNode = { kind: "number"; value: number };
export type RefNode = { kind: "ref"; path: string[] };
export type CallNode = { kind: "call"; name: string; args: AstNode[] };
export type FieldNode = { kind: "field"; expr: AstNode; field: string };
export type BinOpNode = {
  kind: "binop";
  op: "+" | "-" | "*" | "/";
  left: AstNode;
  right: AstNode;
};
export type UnaryNode = { kind: "unary"; op: "-"; operand: AstNode };

export type FnCallNode = { kind: "fncall"; def: FnDef; args: AstNode[] };

export type AstNode =
  | NumberNode
  | RefNode
  | CallNode
  | FieldNode
  | BinOpNode
  | UnaryNode
  | FnCallNode;

// ---------------------------------------------------------------------------
// User-defined function types
// ---------------------------------------------------------------------------

/** Maps a param schema object to the corresponding ExprProxy arg types. */
export type ParamsToExprs<S extends Record<string, GlslType>> = {
  [K in keyof S]: ExprProxy<S[K]>;
};

/**
 * A compiled GLSL function definition.
 * Carried as metadata on every FnCallNode so the compiler can discover
 * which functions are needed by walking the AST — no global registry.
 */
export type FnDef = {
  name: string;
  params: Record<string, GlslType>;
  returnType: GlslType;
  body: FnBodyStatement[]; // local $.let statements inside the fn
  returnExpr: AstNode; // the expression after `return`
};

/**
 * Local statement types inside a fn body (subset of BodyStatement —
 * no assign, since fn functions can't write to gl_FragColor).
 */
export type FnBodyStatement = {
  type: "let";
  name: string;
  varType: GlslType;
  value: AstNode;
};

/**
 * A ShaderFn is a callable that produces a typed ExprProxy when invoked,
 * and exposes its FnDef so the compiler can harvest it from the AST.
 *
 * Args are passed positionally in param-schema key order.
 * Each arg accepts the matching ExprProxy type or a bare number.
 */
/** Named-args callable (object form params). */
export type ShaderFn<
  S extends Record<string, GlslType>,
  R extends GlslType,
> = ((args: { [K in keyof S]: ExprProxy<S[K]> | number }) => ExprProxy<R>) & {
  readonly _def: FnDef;
  readonly glsl: string;
};

/** Maps a GlslType tuple to the corresponding ExprProxy tuple. */
export type TupleToExprs<T extends readonly GlslType[]> = {
  readonly [K in keyof T]: T[K] extends GlslType ? ExprProxy<T[K]> : never;
};

/** Each positional arg accepts its matching ExprProxy or a bare number. */
export type TupleArgs<T extends readonly GlslType[]> = {
  [K in keyof T]: T[K] extends GlslType ? ExprProxy<T[K]> | number : never;
};

/** Positional-args callable (array form params). */
export type TupleShaderFn<
  T extends readonly GlslType[],
  R extends GlslType,
> = ((...args: TupleArgs<T>) => ExprProxy<R>) & {
  readonly _def: FnDef;
  readonly glsl: string;
};

// ---------------------------------------------------------------------------
// GLSL type universe
// ---------------------------------------------------------------------------

export type GlslType =
  | "float"
  | "vec2"
  | "vec3"
  | "vec4"
  | "mat2"
  | "sampler2D";

export type Channels<T extends GlslType> = T extends "float"
  ? never
  : T extends "vec2"
    ? "x" | "y" | "r" | "g"
    : T extends "vec3"
      ? "x" | "y" | "z" | "r" | "g" | "b"
      : T extends "vec4"
        ? "x" | "y" | "z" | "w" | "r" | "g" | "b" | "a"
        : never; // mat2 has no swizzle channels

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

// Scalar float expressions can be used on either side of vec arithmetic —
// GLSL broadcasts them component-wise. Number literals already work; this
// adds support for ExprProxy<"float"> (a runtime float expression).
type ScalarOr<T extends GlslType> = Expr<T> | Expr<"float"> | number;

export type ArithmeticMethods<T extends GlslType> = {
  /** (a + b) */ add(other: ScalarOr<T>): ExprProxy<T>;
  /** (a - b) */ sub(other: ScalarOr<T>): ExprProxy<T>;
  /** (a * b) */ mul(other: ScalarOr<T>): ExprProxy<T>;
  /** (a / b) */ div(other: ScalarOr<T>): ExprProxy<T>;
  /** (-a)    */ neg(): ExprProxy<T>;
};

// mat2 * vec2 → vec2 changes the output type, so mat2 gets its own interface.
export type Mat2Methods = {
  mul(other: Expr<"vec2">): ExprProxy<"vec2">;
  mul(other: Expr<"mat2"> | number): ExprProxy<"mat2">;
  add(other: Expr<"mat2">): ExprProxy<"mat2">;
  sub(other: Expr<"mat2">): ExprProxy<"mat2">;
  neg(): ExprProxy<"mat2">;
};

// vec2 * mat2 → vec2 (left-multiply / row-vector form)
export type Vec2Methods = {
  mul(
    other: Expr<"vec2"> | Expr<"mat2"> | Expr<"float"> | number,
  ): ExprProxy<"vec2">;
  add(other: Expr<"vec2"> | Expr<"float"> | number): ExprProxy<"vec2">;
  sub(other: Expr<"vec2"> | Expr<"float"> | number): ExprProxy<"vec2">;
  div(other: Expr<"vec2"> | Expr<"float"> | number): ExprProxy<"vec2">;
  neg(): ExprProxy<"vec2">;
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

export type ExprProxy<T extends GlslType> = Expr<T> &
  SwizzleProps<T> &
  (T extends "mat2"
    ? Mat2Methods
    : T extends "vec2"
      ? Vec2Methods
      : ArithmeticMethods<T>);

// ---------------------------------------------------------------------------
// Statement types
// ---------------------------------------------------------------------------

export type BodyStatement =
  | { type: "let"; name: string; varType: GlslType; value: AstNode }
  | { type: "assign"; target: string; value: AstNode };

export type ConstStatement = {
  type: "const";
  name: string;
  varType: GlslType;
  value: AstNode;
};

// ---------------------------------------------------------------------------
// ShaderContext — the $ object exposed to the fragment function
// ---------------------------------------------------------------------------

type UniformExprKind<K> = K extends "texture2D" ? "sampler2D" : K;

type UniformShape = UniformSchema | UniformMap;

type UniformSpecType<T> = T extends { readonly type: infer Type }
  ? Type
  : T extends { readonly kind: infer Kind }
    ? Kind
    : never;

type TextureResolutionExprs<U extends UniformShape> = {
  readonly [K in keyof U as UniformSpecType<U[K]> extends "texture2D"
    ? `${Extract<K, string>}Resolution`
    : never]: ExprProxy<"vec2">;
};

export type TextureUniformExpr = ExprProxy<"sampler2D"> & {
  readonly resolution: ExprProxy<"vec2">;
  sample(uv: Expr<"vec2">): ExprProxy<"vec4">;
  sample(
    x: Expr<"float"> | number,
    y: Expr<"float"> | number,
  ): ExprProxy<"vec4">;
};

export type UniformExprs<U extends UniformShape> = {
  readonly [K in keyof U]: UniformSpecType<U[K]> extends "texture2D"
    ? TextureUniformExpr
    : UniformExprKind<UniformSpecType<U[K]>> extends GlslType
      ? ExprProxy<UniformExprKind<UniformSpecType<U[K]>>>
      : never;
} & TextureResolutionExprs<U>;

export type ShaderContext<U extends UniformShape = UniformSchema> = {
  /** Declare a named local variable. */
  let<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  /** Declare an auto-named local variable (_v0, _v1, …). */
  let<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
  /** Declare a named top-level GLSL constant (emitted before main). */
  const<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  const(name: string, value: number): ExprProxy<"float">;
  /** Declare an auto-named top-level GLSL constant (_c0, _c1, …). */
  const<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
  const(value: number): ExprProxy<"float">;
  /** Write to gl_FragColor — must be vec4. */
  output(value: Expr<"vec4">): void;
  /** Custom uniforms. `$.u.pixelation` compiles to `u_pixelation`. */
  readonly u: UniformExprs<U>;
  /** Interpolated UV coord in [0,1]². */
  readonly uv: ExprProxy<"vec2">;
  /** Elapsed time in seconds (u_time uniform). */
  readonly time: ExprProxy<"float">;
  /** Canvas resolution in physical pixels (u_resolution uniform). */
  readonly resolution: ExprProxy<"vec2">;
  /** Mouse position in physical pixel coordinates (u_mouse uniform). Defaults to vec2(0) before movement. */
  readonly mouse: ExprProxy<"vec2">;
  /** Raw fragment pixel coordinates — gl_FragCoord.xy. Ranges from (0,0) to (width,height).
   *  For normalized [0,1] UV coords use $.uv instead. */
  readonly coord: ExprProxy<"vec2">;
};
