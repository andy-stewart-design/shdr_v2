import { refProxy, toNode, glslTypeOf, compileExpr } from "./ast.ts";
import { vec2, vec3, vec4, mat2, sin, cos, abs, fract, sqrt, floor, mix, smoothstep, radians, dot, length } from "./builtins.ts";
import type { AstNode, BodyStatement, ConstStatement, Expr, ExprProxy, FnDef, GlslType, ShaderContext } from "./types.ts";

// ---------------------------------------------------------------------------
// Statement types (internal to the compiler)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FnDef collection + emission
// ---------------------------------------------------------------------------

// Walk the full AST of a compiled fragment and collect all FnDefs in the
// order they must be emitted (dependencies before dependents).
function collectFnDefs(stmts: BodyStatement[], consts: ConstStatement[]): FnDef[] {
  const seen    = new Set<string>(); // fully processed
  const stack   = new Set<string>(); // currently on the DFS path — cycle detection
  const ordered: FnDef[] = [];

  function walkNode(node: AstNode): void {
    switch (node.kind) {
      case "fncall": {
        const { name } = node.def;

        if (stack.has(name)) {
          const path = [...stack, name].join(" → ");
          throw new Error(`Circular dependency detected in shader functions: ${path}`);
        }

        // Walk args first so any deps they carry are registered
        for (const arg of node.args) walkNode(arg);

        if (!seen.has(name)) {
          seen.add(name);
          stack.add(name);
          // Recurse into the function's own body to find nested deps
          for (const s of node.def.body) walkNode(s.value);
          walkNode(node.def.returnExpr);
          stack.delete(name);
          ordered.push(node.def);
        }
        break;
      }
      case "call":   for (const a of node.args) walkNode(a);   break;
      case "field":  walkNode(node.expr);                       break;
      case "binop":  walkNode(node.left); walkNode(node.right); break;
      case "unary":  walkNode(node.operand);                    break;
      case "number":
      case "ref":    break;
    }
  }

  for (const c of consts) walkNode(c.value);
  for (const s of stmts)  walkNode(s.value);

  return ordered;
}

function compileFnDef(def: FnDef): string {
  const paramList = Object.entries(def.params)
    .map(([n, t]) => `${glslKeyword[t]} ${n}`)
    .join(", ");

  const bodyLines = [
    ...def.body.map(
      (s) => `  ${glslKeyword[s.varType]} ${s.name} = ${compileExpr(s.value)};`,
    ),
    `  return ${compileExpr(def.returnExpr)};`,
  ];

  return [
    `${glslKeyword[def.returnType]} ${def.name}(${paramList}) {`,
    ...bodyLines,
    `}`,
  ].join("\n");
}

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

  let constCounter = 0;
  function makeConst(name: string, value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  function makeConst(value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
  function makeConst(nameOrValue: unknown, maybeValue?: unknown): unknown {
    const hasName = typeof nameOrValue === "string";
    const name  = hasName ? nameOrValue as string : `_c${constCounter++}`;
    const value = hasName ? maybeValue : nameOrValue;
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

  const fnDefs = collectFnDefs(statements, constants);

  return [
    "precision mediump float;",
    "uniform float u_time;",
    "uniform vec2 u_resolution;",
    ...(constants.length > 0 ? [""] : []),
    ...constants.map((c) => `const ${glslKeyword[c.varType]} ${c.name} = ${compileExpr(c.value)};`),
    ...(fnDefs.length > 0 ? [""] : []),
    ...fnDefs.map((d) => compileFnDef(d)),
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
