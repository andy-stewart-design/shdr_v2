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

export function createLocalContext(options: {
  prefix: string;
  statements?: LocalStatement[];
  addStatement?: (statement: LocalStatement) => void;
}): {
  context: LocalContext;
  statements: LocalStatement[];
} {
  const statements = options.statements ?? [];
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

      const statement = {
        type: "let" as const,
        name,
        varType,
        value: toNode(value),
      };
      if (options.addStatement) options.addStatement(statement);
      else statements.push(statement);

      return refProxy([name], varType);
    },
  };

  return { context, statements };
}
