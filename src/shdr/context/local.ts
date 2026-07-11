import { glslTypeOf, refProxy, toNode } from "../ast";
import type { AstNode, ExprProxy, GlslType } from "../types";

export type LocalContext = {
  /** Declare a named local variable. */
  let<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  /** Declare an auto-named local variable. */
  let<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
};

type LocalStatement = {
  type: "let";
  name: string;
  varType: GlslType;
  value: AstNode;
};

export function createLocalContext<TStatement extends LocalStatement>(options: {
  prefix: string;
}): {
  context: LocalContext;
  statements: TStatement[];
} {
  const statements: TStatement[] = [];
  let counter = 0;

  const context: LocalContext = {
    let<T extends GlslType>(
      nameOrValue: string | ExprProxy<T>,
      maybeValue?: ExprProxy<T>,
    ): ExprProxy<T> {
      const name =
        typeof nameOrValue === "string"
          ? nameOrValue
          : `${options.prefix}${counter++}`;
      const value = typeof nameOrValue === "string" ? maybeValue! : nameOrValue;
      const varType = glslTypeOf(value);

      statements.push({
        type: "let",
        name,
        varType,
        value: toNode(value),
      } as TStatement);

      return refProxy([name], varType);
    },
  };

  return { context, statements };
}
