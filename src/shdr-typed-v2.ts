// ---------------------------------------------------------------------------
// AST nodes (runtime)
// ---------------------------------------------------------------------------

const NODE = Symbol("node");
const GLSL_TYPE = Symbol("glslType");

type NumberNode = { kind: "number"; value: number };
type RefNode = { kind: "ref"; path: string[] };
type CallNode = { kind: "call"; name: string; args: AstNode[] };
type FieldNode = { kind: "field"; expr: AstNode; field: string };
type BinOpNode = {
  kind: "binop";
  op: "+" | "-" | "*" | "/";
  left: AstNode;
  right: AstNode;
};
type UnaryNode = { kind: "unary"; op: "-"; operand: AstNode };

type AstNode =
  | NumberNode
  | RefNode
  | CallNode
  | FieldNode
  | BinOpNode
  | UnaryNode;

// ---------------------------------------------------------------------------
// GLSL type universe
// ---------------------------------------------------------------------------

type GlslType = "float" | "vec2" | "vec3" | "vec4" | "mat2";

type Channels<T extends GlslType> = T extends "float"
  ? never
  : T extends "vec2"
    ? "x" | "y" | "r" | "g"
    : T extends "vec3"
      ? "x" | "y" | "z" | "r" | "g" | "b"
      : T extends "vec4"
        ? "x" | "y" | "z" | "w" | "r" | "g" | "b" | "a"
        : never; // mat2 has no swizzle channels

// ---------------------------------------------------------------------------
// Expr<T> — AST handle carrying both the node and the runtime GLSL type
// ---------------------------------------------------------------------------

type Expr<T extends GlslType> = {
  readonly [NODE]: AstNode;
  readonly [GLSL_TYPE]: T; // stored at runtime — not phantom
};

function makeExpr<T extends GlslType>(node: AstNode, type: T): Expr<T> {
  return { [NODE]: node, [GLSL_TYPE]: type } as unknown as Expr<T>;
}

function glslTypeOf(value: Expr<GlslType>): GlslType {
  return (value as unknown as { [key: symbol]: GlslType })[GLSL_TYPE];
}

function toNode(value: Expr<GlslType> | number): AstNode {
  if (typeof value === "number") return { kind: "number", value };
  return (value as unknown as { [NODE]: AstNode })[NODE];
}

// ---------------------------------------------------------------------------
// Arithmetic methods — chainable on every ExprProxy
// ---------------------------------------------------------------------------

// Standard arithmetic — same type in, same type out.
type ArithmeticMethods<T extends GlslType> = {
  /** (a + b) */ add(other: Expr<T> | number): ExprProxy<T>;
  /** (a - b) */ sub(other: Expr<T> | number): ExprProxy<T>;
  /** (a * b) */ mul(other: Expr<T> | number): ExprProxy<T>;
  /** (a / b) */ div(other: Expr<T> | number): ExprProxy<T>;
  /** (-a)    */ neg(): ExprProxy<T>;
};

// mat2 is special: mat2 * vec2 → vec2 (type changes), mat2 * mat2 → mat2.
type Mat2Methods = {
  mul(other: Expr<"vec2">): ExprProxy<"vec2">;
  mul(other: Expr<"mat2"> | number): ExprProxy<"mat2">;
  add(other: Expr<"mat2">): ExprProxy<"mat2">;
  sub(other: Expr<"mat2">): ExprProxy<"mat2">;
  neg(): ExprProxy<"mat2">;
};

// ---------------------------------------------------------------------------
// ExprProxy<T> — typed swizzle + arithmetic chaining
// ---------------------------------------------------------------------------

type SwizzleProps<T extends GlslType> = {
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
  (T extends "mat2" ? Mat2Methods : ArithmeticMethods<T>);

// ---------------------------------------------------------------------------
// makeProxy — unified proxy factory (replaces the old exprProxy + makeCall)
// ---------------------------------------------------------------------------

const ARITH_OPS = { add: "+", sub: "-", mul: "*", div: "/" } as const;
type ArithKey = keyof typeof ARITH_OPS;

function makeProxy<T extends GlslType>(node: AstNode, type: T): ExprProxy<T> {
  const expr = makeExpr<T>(node, type);

  return new Proxy(expr, {
    get(_target, prop) {
      if (prop === NODE) return node;
      if (prop === GLSL_TYPE) return type;
      if (
        prop === Symbol.toPrimitive ||
        prop === "toString" ||
        prop === "valueOf"
      )
        return () => compileExpr(node);

      if (typeof prop !== "string") return undefined;

      // mat2 * vec2 → vec2; everything else preserves the parent type
      if (prop === "mul") {
        return (other: Expr<GlslType> | number) => {
          const otherType: GlslType =
            typeof other === "number"
              ? "float"
              : glslTypeOf(other as Expr<GlslType>);
          const resultType: GlslType =
            type === "mat2" && otherType === "vec2" ? "vec2" : type;
          return makeProxy(
            { kind: "binop", op: "*", left: node, right: toNode(other) },
            resultType,
          );
        };
      }

      // All other arithmetic — preserve the parent type
      if (prop in ARITH_OPS) {
        const op = ARITH_OPS[prop as ArithKey];
        return (other: Expr<GlslType> | number): ExprProxy<T> =>
          makeProxy<T>(
            { kind: "binop", op, left: node, right: toNode(other) },
            type,
          );
      }

      if (prop === "neg") {
        return (): ExprProxy<T> =>
          makeProxy<T>({ kind: "unary", op: "-", operand: node }, type);
      }

      // Swizzle / field access — single char → float, multi-char → vec by length
      const swizzleType: GlslType =
        prop.length === 1
          ? "float"
          : prop.length === 2
            ? "vec2"
            : prop.length === 3
              ? "vec3"
              : "vec4";
      return makeProxy({ kind: "field", expr: node, field: prop }, swizzleType);
    },
  }) as unknown as ExprProxy<T>;
}

// Convenience: build a ref proxy from a path (for $.uv, $.let returns, etc.)
function refProxy<T extends GlslType>(path: string[], type: T): ExprProxy<T> {
  return makeProxy<T>({ kind: "ref", path }, type);
}

// Convenience: build a call-node proxy
function makeCall<T extends GlslType>(
  name: string,
  args: (Expr<GlslType> | number)[],
  type: T,
): ExprProxy<T> {
  return makeProxy<T>({ kind: "call", name, args: args.map(toNode) }, type);
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : `${n}`;
}

function compileExpr(node: AstNode): string {
  switch (node.kind) {
    case "number":
      return formatNumber(node.value);
    case "ref":
      return node.path.join(".");
    case "call":
      return `${node.name}(${node.args.map(compileExpr).join(", ")})`;
    case "field":
      return `${compileExpr(node.expr)}.${node.field}`;
    case "binop":
      return `(${compileExpr(node.left)} ${node.op} ${compileExpr(node.right)})`;
    case "unary":
      return `(-${compileExpr(node.operand)})`;
  }
}

// ---------------------------------------------------------------------------
// GLSL type argument aliases
// ---------------------------------------------------------------------------

type FloatArg = Expr<"float"> | number;

// ---------------------------------------------------------------------------
// Vector constructors — overloaded so arg counts/types are enforced
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

// mat2 — column-major constructor
// mat2(col0, col1)        — two vec2 columns
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
// Scalar/vector builtins — overloaded by input type (genType pattern)
// ---------------------------------------------------------------------------

type ScalarBuiltin = {
  (x: FloatArg): ExprProxy<"float">;
  (v: Expr<"vec2">): ExprProxy<"vec2">;
  (v: Expr<"vec3">): ExprProxy<"vec3">;
  (v: Expr<"vec4">): ExprProxy<"vec4">;
};

function makeScalarBuiltin(name: string): ScalarBuiltin {
  return ((arg: Expr<GlslType> | number) => {
    const argType: GlslType =
      typeof arg === "number" ? "float" : glslTypeOf(arg);
    return makeCall(name, [arg], argType);
  }) as unknown as ScalarBuiltin;
}

export const sin = makeScalarBuiltin("sin");
export const cos = makeScalarBuiltin("cos");
export const abs = makeScalarBuiltin("abs");
export const fract = makeScalarBuiltin("fract");
export const sqrt = makeScalarBuiltin("sqrt");
export const floor = makeScalarBuiltin("floor");

export function mix<T extends "float" | "vec2" | "vec3" | "vec4">(
  a: Expr<T> | number,
  b: Expr<T> | number,
  t: FloatArg,
): ExprProxy<T> {
  const type: GlslType =
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
): ExprProxy<"float"> {
  return makeCall<"float">("smoothstep", [edge0, edge1, x], "float");
}

export function radians(deg: FloatArg): ExprProxy<"float"> {
  return makeCall<"float">("radians", [deg], "float");
}

export function dot(
  a: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
  b: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall<"float">("dot", [a, b], "float");
}

export function length(
  v: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall<"float">("length", [v], "float");
}

// ---------------------------------------------------------------------------
// ShaderContext  — the $ object passed to createShader
// ---------------------------------------------------------------------------

type BodyStatement =
  | { type: "let"; name: string; varType: GlslType; value: AstNode }
  | { type: "assign"; target: string; value: AstNode };

type ConstStatement = {
  type: "const";
  name: string;
  varType: GlslType;
  value: AstNode;
};

type ShaderContext = {
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
};

// ---------------------------------------------------------------------------
// createShader
// ---------------------------------------------------------------------------

type Builtins = {
  vec2: typeof vec2;
  mat2: typeof mat2;
  vec3: typeof vec3;
  vec4: typeof vec4;
  sin: typeof sin;
  cos: typeof cos;
  abs: typeof abs;
  fract: typeof fract;
  sqrt: typeof sqrt;
  floor: typeof floor;
  mix: typeof mix;
  smoothstep: typeof smoothstep;
  radians: typeof radians;
  dot: typeof dot;
  length: typeof length;
};

const glslKeyword: Record<GlslType, string> = {
  float: "float",
  vec2: "vec2",
  vec3: "vec3",
  vec4: "vec4",
  mat2: "mat2",
};

export function createShader(
  fn: (ctx: { $: ShaderContext } & Builtins) => void,
): string {
  const constants: ConstStatement[] = [];
  const statements: BodyStatement[] = [];

  // Standalone overloaded function so TS can check both overload signatures.
  // number overload first — TS picks the first matching overload top-to-bottom.
  function makeConst(name: string, value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(
    name: string,
    value: ExprProxy<T>,
  ): ExprProxy<T>;
  function makeConst(name: string, value: unknown): unknown {
    const isNum = typeof value === "number";
    const node: AstNode = isNum
      ? { kind: "number", value: value }
      : toNode(value as Expr<GlslType>);
    const varType: GlslType = isNum
      ? "float"
      : glslTypeOf(value as Expr<GlslType>);
    constants.push({ type: "const", name, varType, value: node });
    return refProxy([name], varType);
  }

  let varCounter = 0;
  const $: ShaderContext = {
    let<T extends GlslType>(
      nameOrValue: string | ExprProxy<T>,
      maybeValue?: ExprProxy<T>,
    ): ExprProxy<T> {
      const name =
        typeof nameOrValue === "string" ? nameOrValue : `_v${varCounter++}`;
      const value = typeof nameOrValue === "string" ? maybeValue! : nameOrValue;
      const node = toNode(value);
      statements.push({
        type: "let",
        name,
        varType: glslTypeOf(value),
        value: node,
      });
      return refProxy<T>([name], glslTypeOf(value) as T);
    },
    const: makeConst,
    fragColor(value: Expr<"vec4">) {
      statements.push({
        type: "assign",
        target: "gl_FragColor",
        value: toNode(value),
      });
    },
    get uv(): ExprProxy<"vec2"> {
      return refProxy<"vec2">(["uv"], "vec2");
    },
  };

  fn({
    $,
    vec2,
    mat2,
    vec3,
    vec4,
    sin,
    cos,
    abs,
    fract,
    sqrt,
    floor,
    mix,
    smoothstep,
    radians,
    dot,
    length,
  });

  const lines = [
    "precision mediump float;",
    "uniform vec2 u_resolution;",
    ...(constants.length > 0 ? [""] : []),
    ...constants.map(
      (c) =>
        `const ${glslKeyword[c.varType]} ${c.name} = ${compileExpr(c.value)};`,
    ),
    "",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / u_resolution.xy;",
    ...statements.map((stmt) => {
      if (stmt.type === "let")
        return `  ${glslKeyword[stmt.varType]} ${stmt.name} = ${compileExpr(stmt.value)};`;
      return `  ${stmt.target} = ${compileExpr(stmt.value)};`;
    }),
    "}",
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Example — one $.let per GLSL line, mirroring the target shader structure
// ---------------------------------------------------------------------------
//
// Target GLSL:
//
//   vec2  tuv        = uv - 0.5;
//   float speed      = u_time * 2.0;
//   float distX      = sin(tuv.y * 5.0 + speed) / 30.0;
//   float distY      = sin(tuv.x * 7.5 + speed) / 60.0;
//   float layerBlend = smoothstep(-0.3, 0.2, tuv.x + distX);
//   vec3  layer1     = mix(COLOR_ORANGE, COLOR_BLUE,   layerBlend);
//   vec3  layer2     = mix(COLOR_YELLOW, COLOR_GREEN,  layerBlend);
//   vec3  color      = mix(layer1, layer2, smoothstep(0.5, -0.3, tuv.y + distY));
//   gl_FragColor     = vec4(color, 1.0);

export const shader = createShader(
  ({ $, vec3, vec4, sin, mix, smoothstep }) => {
    // Top-level GLSL constants
    const COLOR_GREEN = $.const(
      "COLOR_GREEN",
      vec3(76.0 / 255.0, 225.0 / 255.0, 96.0 / 255.0),
    );
    const COLOR_BLUE = $.const(
      "COLOR_BLUE",
      vec3(132.0 / 255.0, 180.0 / 255.0, 251.0 / 255.0),
    );
    const COLOR_ORANGE = $.const(
      "COLOR_ORANGE",
      vec3(255.0 / 255.0, 130.0 / 255.0, 90.0 / 255.0),
    );
    const COLOR_YELLOW = $.const(
      "COLOR_YELLOW",
      vec3(246.0 / 255.0, 224.0 / 255.0, 22.0 / 255.0),
    );
    const WAVE_FREQ = $.const("WAVE_FREQUENCY", 5.0);
    const WAVE_AMP = $.const("WAVE_AMPLITUDE", 30.0);

    // main() body
    const tuv = $.let("tuv", $.uv.sub(0.5));
    const speed = $.let("speed", tuv.x.mul(0.0).add(1.0)); // placeholder for u_time
    const distX = $.let(
      "distX",
      sin(tuv.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP),
    );
    const distY = $.let(
      "distY",
      sin(tuv.x.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP),
    );
    const layerBlend = $.let(
      "layerBlend",
      smoothstep(-0.3, 0.2, tuv.x.add(distX)),
    );
    const layer1 = $.let("layer1", mix(COLOR_ORANGE, COLOR_BLUE, layerBlend));
    const layer2 = $.let("layer2", mix(COLOR_YELLOW, COLOR_GREEN, layerBlend));
    const color = $.let(
      "color",
      mix(layer1, layer2, smoothstep(0.5, -0.3, tuv.y.add(distY))),
    );

    $.fragColor(vec4(color, 1.0));
  },
);

console.log(shader);
