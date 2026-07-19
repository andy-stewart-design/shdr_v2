import { createFragmentContext, type FragmentFn } from "./context/fragment";
import { emitFragmentGlsl, emitGlslFunction } from "./glsl";
import { buildFunctionProgram, ProgramBuilder } from "./program";
import { validateUniformSchema, type UniformSchema } from "./uniforms";
import type { FnDef } from "./types";

export { glslKeyword } from "./glsl";
export type { FragmentFn } from "./context/fragment";

/** Compile a reusable shader function, including its dependencies. */
export function compileFn(shaderFn: { readonly _def: FnDef }): string {
  return buildFunctionProgram(shaderFn._def)
    .functions.map(emitGlslFunction)
    .join("\n");
}

/** Compile a fragment authoring callback into GLSL ES 3.00. */
export function compileFragment<U extends UniformSchema = UniformSchema>(
  fn: FragmentFn<U>,
  options: { uniforms?: U } = {},
): string {
  validateUniformSchema(options.uniforms);
  const uniforms = options.uniforms ?? ({} as U);
  const builder = new ProgramBuilder(uniforms);
  const context = createFragmentContext(uniforms, builder);

  fn(context.ctx);

  const program = builder.build();
  return emitFragmentGlsl(program);
}
