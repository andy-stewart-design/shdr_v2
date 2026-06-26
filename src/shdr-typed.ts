// ---------------------------------------------------------------------------
// AST nodes (runtime)
// ---------------------------------------------------------------------------

const NODE = Symbol("node");

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

type GlslType = "float" | "vec2" | "vec3" | "vec4";

type Channels<T extends GlslType> = T extends "float"
  ? never
  : T extends "vec2"
    ? "x" | "y" | "r" | "g"
    : T extends "vec3"
      ? "x" | "y" | "z" | "r" | "g" | "b"
      : "x" | "y" | "z" | "w" | "r" | "g" | "b" | "a";

// ---------------------------------------------------------------------------
// Expr<T> — phantom-typed AST handle
// ---------------------------------------------------------------------------

type Expr<T extends GlslType> = {
  readonly [NODE]: AstNode;
  readonly __glslType: T; // phantom only — never set at runtime
};

function makeExpr<T extends GlslType>(node: AstNode): Expr<T> {
  return { [NODE]: node } as unknown as Expr<T>;
}

function toNode(value: Expr<GlslType> | number): AstNode {
  if (typeof value === "number") return { kind: "number", value };
  return (value as unknown as { [NODE]: AstNode })[NODE];
}

// ---------------------------------------------------------------------------
// Arithmetic methods — chainable on every ExprProxy
// ---------------------------------------------------------------------------

// Arithmetic between same-type exprs preserves the type.
// Scalars (number | float) can be used on either side of vec arithmetic
// (GLSL broadcasts them), so we allow `Expr<T> | number` uniformly.
type ArithmeticMethods<T extends GlslType> = {
  /** (a + b) */ add(other: Expr<T> | number): ExprProxy<T>;
  /** (a - b) */ sub(other: Expr<T> | number): ExprProxy<T>;
  /** (a * b) */ mul(other: Expr<T> | number): ExprProxy<T>;
  /** (a / b) */ div(other: Expr<T> | number): ExprProxy<T>;
  /** (-a)    */ neg(): ExprProxy<T>;
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
  ArithmeticMethods<T>;

// ---------------------------------------------------------------------------
// makeProxy — unified proxy factory (replaces the old exprProxy + makeCall)
// ---------------------------------------------------------------------------

const ARITH_OPS = { add: "+", sub: "-", mul: "*", div: "/" } as const;
type ArithKey = keyof typeof ARITH_OPS;

function makeProxy<T extends GlslType>(node: AstNode): ExprProxy<T> {
  const expr = makeExpr<T>(node);

  return new Proxy(expr, {
    get(_target, prop) {
      if (prop === NODE) return node;
      if (prop === "__glslType") return undefined;
      // Allow template-literal / string coercion to produce valid GLSL source
      if (
        prop === Symbol.toPrimitive ||
        prop === "toString" ||
        prop === "valueOf"
      )
        return () => compileExpr(node);

      if (typeof prop !== "string") return undefined;

      // Arithmetic methods — return a function that builds a BinOpNode
      if (prop in ARITH_OPS) {
        const op = ARITH_OPS[prop as ArithKey];
        return (other: Expr<GlslType> | number): ExprProxy<T> =>
          makeProxy<T>({ kind: "binop", op, left: node, right: toNode(other) });
      }

      // Unary negation
      if (prop === "neg") {
        return (): ExprProxy<T> =>
          makeProxy<T>({ kind: "unary", op: "-", operand: node });
      }

      // Swizzle / field access — always produces a FieldNode so the full
      // parent expression is preserved (fixes the old bug where call-node
      // swizzles used the function name as the path root)
      return makeProxy({ kind: "field", expr: node, field: prop });
    },
  }) as unknown as ExprProxy<T>;
}

// Convenience: build a ref proxy from a path (for $.uv, $.let returns, etc.)
function refProxy<T extends GlslType>(path: string[]): ExprProxy<T> {
  return makeProxy<T>({ kind: "ref", path });
}

// Convenience: build a call-node proxy
function makeCall<T extends GlslType>(
  name: string,
  args: (Expr<GlslType> | number)[],
): ExprProxy<T> {
  return makeProxy<T>({ kind: "call", name, args: args.map(toNode) });
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
  return makeCall("vec2", args);
}

export function vec3(x: FloatArg, y: FloatArg, z: FloatArg): ExprProxy<"vec3">;
export function vec3(xy: Expr<"vec2">, z: FloatArg): ExprProxy<"vec3">;
export function vec3(x: FloatArg, yz: Expr<"vec2">): ExprProxy<"vec3">;
export function vec3(xyz: FloatArg): ExprProxy<"vec3">;
export function vec3(...args: (FloatArg | Expr<"vec2">)[]): ExprProxy<"vec3"> {
  return makeCall("vec3", args as (Expr<GlslType> | number)[]);
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
  return makeCall("vec4", args as (Expr<GlslType> | number)[]);
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
  return ((arg: Expr<GlslType> | number) =>
    makeCall(name, [arg])) as unknown as ScalarBuiltin;
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
  return makeCall<T>("mix", [a, b, t]);
}

export function smoothstep(
  edge0: FloatArg,
  edge1: FloatArg,
  x: FloatArg,
): ExprProxy<"float"> {
  return makeCall<"float">("smoothstep", [edge0, edge1, x]);
}

export function radians(deg: FloatArg): ExprProxy<"float"> {
  return makeCall<"float">("radians", [deg]);
}

export function dot(
  a: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
  b: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall<"float">("dot", [a, b]);
}

export function length(
  v: Expr<"vec2"> | Expr<"vec3"> | Expr<"vec4">,
): ExprProxy<"float"> {
  return makeCall<"float">("length", [v]);
}

// ---------------------------------------------------------------------------
// ShaderContext  — the $ object passed to createShader
// ---------------------------------------------------------------------------

type Statement =
  | { type: "let"; name: string; varType: GlslType; value: AstNode }
  | { type: "assign"; target: string; value: AstNode };

type ShaderContext = {
  /** Declare a local variable; returns a typed proxy for later use. */
  let<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
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

function inferGlslType(node: AstNode): GlslType {
  if (node.kind === "call" && /^vec[234]$/.test(node.name))
    return node.name as GlslType;
  return "float";
}

const glslKeyword: Record<GlslType, string> = {
  float: "float",
  vec2: "vec2",
  vec3: "vec3",
  vec4: "vec4",
};

export function createShader(
  fn: (ctx: { $: ShaderContext } & Builtins) => void,
): string {
  const statements: Statement[] = [];

  const $: ShaderContext = {
    let<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T> {
      const node = toNode(value);
      statements.push({
        type: "let",
        name,
        varType: inferGlslType(node),
        value: node,
      });
      return refProxy<T>([name]);
    },
    fragColor(value: Expr<"vec4">) {
      statements.push({
        type: "assign",
        target: "gl_FragColor",
        value: toNode(value),
      });
    },
    get uv(): ExprProxy<"vec2"> {
      return refProxy<"vec2">(["uv"]);
    },
  };

  fn({
    $,
    vec2,
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
// Example — arithmetic chaining in action
// ---------------------------------------------------------------------------

export const shader = createShader(
  ({ $, vec4, vec3, sin, smoothstep, mix }) => {
    const uv = $.uv;

    // Original GLSL:
    //   tuv.x += sin(tuv.y * WAVE_FREQUENCY + speed) / WAVE_AMPLITUDE;
    // DSL equivalent (left-to-right, reads like the computation flows):
    const WAVE_FREQUENCY = 5.0;
    const WAVE_AMPLITUDE = 30.0;
    const speed = 1.0;

    const foo = uv.y.mul(WAVE_FREQUENCY).add(speed);
    const bar = sin(foo).div(WAVE_AMPLITUDE);
    const distortedX = uv.x.add(bar);

    const r = smoothstep(0.0, 1.0, distortedX); // ExprProxy<'float'>
    const color = mix(vec3(0.3, 0.7, 1.0), vec3(1.0, 0.5, 0.2), r);
    $.fragColor(vec4(color, 1.0));
  },
);

// console.log(shader);
