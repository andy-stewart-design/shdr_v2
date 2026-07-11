import { compileExpr } from "./ast";
import { createFragmentContext, type FragmentFn } from "./context/fragment";
import {
  emitUniformDeclarations,
  validateUniformSchema,
  type UniformSchema,
} from "./uniforms";
import type {
  AstNode,
  BodyStatement,
  ConstStatement,
  FnDef,
  GlslType,
} from "./types";

// ---------------------------------------------------------------------------
// FnDef collection + emission
// ---------------------------------------------------------------------------

// Shared DFS walker — collects FnDefs in topological order (deps first).
function makeFnDefCollector() {
  const seen = new Set<string>();
  const stack = new Set<string>();
  const ordered: FnDef[] = [];

  function walkNode(node: AstNode): void {
    switch (node.kind) {
      case "fncall": {
        const { name } = node.def;
        if (stack.has(name)) {
          const path = [...stack, name].join(" \u2192 ");
          throw new Error(
            `Circular dependency detected in shader functions: ${path}`,
          );
        }
        for (const arg of node.args) walkNode(arg);
        if (!seen.has(name)) {
          seen.add(name);
          stack.add(name);
          for (const s of node.def.body) walkNode(s.value);
          walkNode(node.def.returnExpr);
          stack.delete(name);
          ordered.push(node.def);
        }
        break;
      }
      case "call":
        for (const a of node.args) walkNode(a);
        break;
      case "field":
        walkNode(node.expr);
        break;
      case "binop":
        walkNode(node.left);
        walkNode(node.right);
        break;
      case "unary":
        walkNode(node.operand);
        break;
      case "number":
      case "ref":
        break;
    }
  }

  return { walkNode, ordered };
}

// Walk the full AST of a compiled fragment and collect all FnDefs.
function collectFnDefs(
  stmts: BodyStatement[],
  consts: ConstStatement[],
): FnDef[] {
  const { walkNode, ordered } = makeFnDefCollector();
  for (const c of consts) walkNode(c.value);
  for (const s of stmts) walkNode(s.value);
  return ordered;
}

// Collect deps for a single FnDef (used by compileFn).
function collectFnDefsFrom(def: FnDef): FnDef[] {
  const { walkNode, ordered } = makeFnDefCollector();
  for (const s of def.body) walkNode(s.value);
  walkNode(def.returnExpr);
  // Push the root def itself last (after all its deps)
  ordered.push(def);
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
// compileFn — inspect a single fn() result as standalone GLSL
// ---------------------------------------------------------------------------

/**
 * Compile a fn()-defined function to a GLSL string, including any
 * dependencies it calls. Useful for logging and debugging.
 *
 * @example
 * import { rot } from "./shader-utils";
 * console.log(compileFn(rot));
 * // mat2 rot(float _p0) { ... }
 */
export function compileFn(shaderFn: { readonly _def: FnDef }): string {
  return collectFnDefsFrom(shaderFn._def).map(compileFnDef).join("\n");
}

// ---------------------------------------------------------------------------
// GLSL keyword map
// ---------------------------------------------------------------------------

export const glslKeyword: Record<GlslType, string> = {
  float: "float",
  vec2: "vec2",
  vec3: "vec3",
  vec4: "vec4",
  mat2: "mat2",
  sampler2D: "sampler2D",
};

// ---------------------------------------------------------------------------
// compileFragment — DSL function → GLSL string
// ---------------------------------------------------------------------------

export function compileFragment<U extends UniformSchema = UniformSchema>(
  fn: FragmentFn<U>,
  options: { uniforms?: U } = {},
): string {
  validateUniformSchema(options.uniforms);
  const customUniforms = options.uniforms ?? ({} as U);
  const { ctx, statements, constants } = createFragmentContext(customUniforms);

  fn(ctx);

  const fnDefs = collectFnDefs(statements, constants);

  return [
    "#version 300 es",
    "precision highp float;",
    "uniform float u_time;",
    "uniform vec2 u_resolution;",
    "uniform vec2 u_mouse;",
    ...emitUniformDeclarations(customUniforms),
    "out vec4 fragColor;",
    ...(constants.length > 0 ? [""] : []),
    ...constants.map(
      (c) =>
        `const ${glslKeyword[c.varType]} ${c.name} = ${compileExpr(c.value)};`,
    ),
    ...(fnDefs.length > 0 ? [""] : []),
    ...fnDefs.map((d) => compileFnDef(d)),
    "",
    "void main() {",
    "  vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;",
    ...statements.map((stmt) => {
      if (stmt.type === "let")
        return `  ${glslKeyword[stmt.varType]} ${stmt.name} = ${compileExpr(stmt.value)};`;
      return `  ${stmt.target} = ${compileExpr(stmt.value)};`;
    }),
    "}",
  ].join("\n");
}
