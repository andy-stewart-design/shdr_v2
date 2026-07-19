import { compileExpr } from "./ast";
import { emitUniformDeclarations } from "./uniforms";
import type { FnDef, GlslType } from "./types";
import type { ShaderProgram } from "./program";

export const glslKeyword: Record<GlslType, string> = {
  float: "float",
  vec2: "vec2",
  vec3: "vec3",
  vec4: "vec4",
  mat2: "mat2",
  sampler2D: "sampler2D",
};

export function emitGlslFunction(definition: FnDef): string {
  const parameters = Object.entries(definition.params)
    .map(([name, type]) => `${glslKeyword[type]} ${name}`)
    .join(", ");
  const body = [
    ...definition.body.map(
      (statement) =>
        `  ${glslKeyword[statement.varType]} ${statement.name} = ${compileExpr(statement.value)};`,
    ),
    `  return ${compileExpr(definition.returnExpr)};`,
  ];

  return [
    `${glslKeyword[definition.returnType]} ${definition.name}(${parameters}) {`,
    ...body,
    "}",
  ].join("\n");
}

export function emitFragmentGlsl(program: ShaderProgram): string {
  return [
    "#version 300 es",
    "precision highp float;",
    "uniform float u_time;",
    "uniform vec2 u_resolution;",
    "uniform vec2 u_mouse;",
    ...emitUniformDeclarations(program.uniforms),
    "out vec4 fragColor;",
    ...(program.constants.length > 0 ? [""] : []),
    ...program.constants.map(
      (constant) =>
        `const ${glslKeyword[constant.varType]} ${constant.name} = ${compileExpr(constant.value)};`,
    ),
    ...(program.functions.length > 0 ? [""] : []),
    ...program.functions.map(emitGlslFunction),
    "",
    "void main() {",
    "  vec2 shdr_uv = gl_FragCoord.xy / u_resolution.xy;",
    ...program.statements.map((statement) =>
      statement.type === "let"
        ? `  ${glslKeyword[statement.varType]} ${statement.name} = ${compileExpr(statement.value)};`
        : `  ${statement.target} = ${compileExpr(statement.value)};`,
    ),
    "}",
  ].join("\n");
}
