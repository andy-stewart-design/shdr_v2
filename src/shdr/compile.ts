import { refProxy, toNode, glslTypeOf, compileExpr } from "./ast.ts";
import { vec2, vec3, vec4, mat2, sin, cos, abs, fract, sqrt, floor, mix, smoothstep, radians, dot, length } from "./builtins.ts";
import type { AstNode, Expr, ExprProxy, GlslType, ShaderContext } from "./types.ts";

// ---------------------------------------------------------------------------
// Statement types (internal to the compiler)
// ---------------------------------------------------------------------------

type BodyStatement =
  | { type: "let";    name: string; varType: GlslType; value: AstNode }
  | { type: "assign"; target: string; value: AstNode };

type ConstStatement =
  | { type: "const";  name: string; varType: GlslType; value: AstNode };

// ---------------------------------------------------------------------------
// Builtins bundle passed into the fragment function
// ---------------------------------------------------------------------------

export type Builtins = {
  vec2: typeof vec2; vec3: typeof vec3; vec4: typeof vec4; mat2: typeof mat2;
  sin:  typeof sin;  cos:  typeof cos;  abs:  typeof abs;
  fract: typeof fract; sqrt: typeof sqrt; floor: typeof floor;
  mix: typeof mix; smoothstep: typeof smoothstep; radians: typeof radians;
  dot: typeof dot; length: typeof length;
};

export type FragmentFn = (ctx: { $: ShaderContext } & Builtins) => void;

// ---------------------------------------------------------------------------
// GLSL keyword map
// ---------------------------------------------------------------------------

export const glslKeyword: Record<GlslType, string> = {
  float: "float", vec2: "vec2", vec3: "vec3", vec4: "vec4", mat2: "mat2",
};

// ---------------------------------------------------------------------------
// compileFragment — DSL function → GLSL string
// ---------------------------------------------------------------------------

export function compileFragment(fn: FragmentFn): string {
  const constants:  ConstStatement[] = [];
  const statements: BodyStatement[]  = [];

  function makeConst(name: string, value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  function makeConst(name: string, value: unknown): unknown {
    const isNum = typeof value === "number";
    const node: AstNode = isNum
      ? { kind: "number", value: value as number }
      : toNode(value as Expr<GlslType>);
    const varType: GlslType = isNum ? "float" : glslTypeOf(value as Expr<GlslType>);
    constants.push({ type: "const", name, varType, value: node });
    return refProxy([name], varType);
  }

  let varCounter = 0;
  const $: ShaderContext = {
    let<T extends GlslType>(
      nameOrValue: string | ExprProxy<T>,
      maybeValue?: ExprProxy<T>,
    ): ExprProxy<T> {
      const name  = typeof nameOrValue === "string" ? nameOrValue : `_v${varCounter++}`;
      const value = typeof nameOrValue === "string" ? maybeValue! : nameOrValue;
      statements.push({ type: "let", name, varType: glslTypeOf(value), value: toNode(value) });
      return refProxy<T>([name], glslTypeOf(value) as T);
    },
    const: makeConst,
    fragColor(value: Expr<"vec4">) {
      statements.push({ type: "assign", target: "gl_FragColor", value: toNode(value) });
    },
    get uv():   ExprProxy<"vec2">  { return refProxy(["uv"],    "vec2");  },
    get time(): ExprProxy<"float"> { return refProxy(["u_time"], "float"); },
  };

  fn({ $, vec2, vec3, vec4, mat2, sin, cos, abs, fract, sqrt, floor, mix, smoothstep, radians, dot, length });

  return [
    "precision mediump float;",
    "uniform float u_time;",
    "uniform vec2 u_resolution;",
    ...(constants.length > 0 ? [""] : []),
    ...constants.map((c) => `const ${glslKeyword[c.varType]} ${c.name} = ${compileExpr(c.value)};`),
    "",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / u_resolution.xy;",
    ...statements.map((stmt) => {
      if (stmt.type === "let")
        return `  ${glslKeyword[stmt.varType]} ${stmt.name} = ${compileExpr(stmt.value)};`;
      return `  ${stmt.target} = ${compileExpr(stmt.value)};`;
    }),
    "}",
  ].join("\n");
}
