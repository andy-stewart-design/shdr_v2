import { NODE, refProxy, toNode, glslTypeOf } from "../ast";
import { createUniformExprs, type UniformSchema } from "../uniforms";
import { fragmentBuiltins, type Builtins } from "./builtins";
import { createLocalContext } from "./local";
import type { ProgramBuilder } from "../program";
import type {
  BodyStatement,
  ConstStatement,
  Expr,
  ExprProxy,
  GlslType,
  ShaderContext,
} from "../types.ts";

export type FragmentFn<U extends UniformSchema = UniformSchema> = (
  ctx: {
    $: ShaderContext<U>;
  } & Builtins,
) => void;

type FragmentContext<U extends UniformSchema> = {
  ctx: Parameters<FragmentFn<U>>[0];
  statements: BodyStatement[];
  constants: ConstStatement[];
};

function isExprProxy(value: unknown): value is ExprProxy<GlslType> {
  return typeof value === "object" && value !== null && NODE in value;
}

export function createFragmentContext<U extends UniformSchema>(
  uniforms: U,
  program: ProgramBuilder<U>,
): FragmentContext<U> {
  const locals = createLocalContext({
    prefix: "_v",
    addStatement: (statement) => program.addStatement(statement),
  });
  const statements: BodyStatement[] = program.statements;
  const constants: ConstStatement[] = program.constants;

  let constCounter = 0;
  function makeConst(name: string, value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(
    name: string,
    value: ExprProxy<T>,
  ): ExprProxy<T>;
  function makeConst(value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
  function makeConst(nameOrValue: unknown, maybeValue?: unknown): unknown {
    const named = typeof nameOrValue === "string";
    const value = named ? maybeValue : nameOrValue;
    const name = named ? nameOrValue : `_c${constCounter++}`;

    if (typeof value === "number") {
      program.addConstant({
        type: "const",
        name,
        varType: "float",
        value: toNode(value),
      });
      return refProxy([name], "float");
    }
    if (!isExprProxy(value)) {
      throw new Error("$.const(value) requires a shader expression or number.");
    }

    const varType = glslTypeOf(value);
    program.addConstant({
      type: "const",
      name,
      varType,
      value: toNode(value),
    });
    return refProxy([name], varType);
  }

  const $: ShaderContext<U> = {
    ...locals.context,
    const: makeConst,
    output(value: Expr<"vec4">) {
      program.addStatement({
        type: "assign",
        target: "fragColor",
        value: toNode(value),
      });
    },
    u: createUniformExprs<U>(uniforms),
    get uv(): ExprProxy<"vec2"> {
      return refProxy(["shdr_uv"], "vec2");
    },
    get time(): ExprProxy<"float"> {
      return refProxy(["u_time"], "float");
    },
    get resolution(): ExprProxy<"vec2"> {
      return refProxy(["u_resolution"], "vec2");
    },
    get mouse(): ExprProxy<"vec2"> {
      return refProxy(["u_mouse"], "vec2");
    },
    get coord(): ExprProxy<"vec2"> {
      return refProxy(["gl_FragCoord", "xy"], "vec2");
    },
  };

  return {
    ctx: { $, ...fragmentBuiltins },
    statements,
    constants,
  };
}
