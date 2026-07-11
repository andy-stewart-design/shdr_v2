import { refProxy, toNode, glslTypeOf } from "../ast";
import { createUniformExprs, type UniformSchema } from "../uniforms";
import { fragmentBuiltins, type Builtins } from "./builtins";
import { createLocalContext } from "./local";
import type {
  AstNode,
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

export function createFragmentContext<U extends UniformSchema>(
  uniforms: U,
): FragmentContext<U> {
  const constants: ConstStatement[] = [];
  const locals = createLocalContext<Extract<BodyStatement, { type: "let" }>>({
    prefix: "_v",
  });
  const statements: BodyStatement[] = locals.statements;

  let constCounter = 0;
  function makeConst(name: string, value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(
    name: string,
    value: ExprProxy<T>,
  ): ExprProxy<T>;
  function makeConst(value: number): ExprProxy<"float">;
  function makeConst<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
  function makeConst(nameOrValue: unknown, maybeValue?: unknown): unknown {
    const hasName = typeof nameOrValue === "string";
    const name = hasName ? (nameOrValue as string) : `_c${constCounter++}`;
    const value = hasName ? maybeValue : nameOrValue;
    const isNum = typeof value === "number";
    const node: AstNode = isNum
      ? { kind: "number", value: value as number }
      : toNode(value as Expr<GlslType>);
    const varType: GlslType = isNum
      ? "float"
      : glslTypeOf(value as Expr<GlslType>);
    constants.push({ type: "const", name, varType, value: node });
    return refProxy([name], varType);
  }

  const $: ShaderContext<U> = {
    ...locals.context,
    const: makeConst,
    output(value: Expr<"vec4">) {
      statements.push({
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
