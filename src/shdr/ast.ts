import type { AstNode, Expr, ExprProxy, GlslType } from "./types.ts";

export const NODE = Symbol("node");
export const GLSL_TYPE = Symbol("glslType");

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

export function makeExpr<T extends GlslType>(node: AstNode, type: T) {
  return { [NODE]: node, [GLSL_TYPE]: type } satisfies Expr<T>;
}

export function glslTypeOf<T extends GlslType>(value: Expr<T>): T {
  return value[GLSL_TYPE];
}

export function toNode(value: Expr<GlslType> | number): AstNode {
  if (typeof value === "number") return { kind: "number", value };
  return value[NODE];
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : `${n}`;
}

export function compileExpr(node: AstNode): string {
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
    case "fncall":
      return `${node.name}(${node.args.map(compileExpr).join(", ")})`;
  }
}

// ---------------------------------------------------------------------------
// Proxy factory
// ---------------------------------------------------------------------------

const ARITH_OPS = { add: "+", sub: "-", mul: "*", div: "/" } as const;
type ArithKey = keyof typeof ARITH_OPS;

function isArithKey(prop: string): prop is ArithKey {
  return Object.hasOwn(ARITH_OPS, prop);
}

export function makeProxy<T extends GlslType>(
  node: AstNode,
  type: T,
): ExprProxy<T> {
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
            typeof other === "number" ? "float" : glslTypeOf(other);
          const resultType: GlslType =
            (type === "mat2" && otherType === "vec2") ||
            (type === "vec2" && otherType === "mat2")
              ? "vec2"
              : type;
          return makeProxy(
            { kind: "binop", op: "*", left: node, right: toNode(other) },
            resultType,
          );
        };
      }

      if (isArithKey(prop)) {
        const op = ARITH_OPS[prop];
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

      // Swizzle / field access — infer result type from character count
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
  }) as ExprProxy<T>;
}

export function refProxy<T extends GlslType>(path: string[], type: T) {
  return makeProxy<T>({ kind: "ref", path }, type);
}

export function makeCall<T extends GlslType>(
  name: string,
  args: (Expr<GlslType> | number)[],
  type: T,
) {
  return makeProxy<T>({ kind: "call", name, args: args.map(toNode) }, type);
}
