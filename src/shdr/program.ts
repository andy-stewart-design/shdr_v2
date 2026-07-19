import { getFunctionDefinition } from "./fn";
import type { AstNode, BodyStatement, ConstStatement, FnDef } from "./types";
import type { UniformSchema } from "./uniforms";

/**
 * Target-independent shader program assembled from an authoring callback.
 * Emitters consume this data; authoring proxies and callbacks do not leak past
 * this boundary.
 */
export type ShaderProgram<U extends UniformSchema = UniformSchema> = {
  uniforms: U;
  constants: ConstStatement[];
  statements: BodyStatement[];
  functions: FnDef[];
};

/** Owns function dependency resolution for one compilation session. */
export class ProgramBuilder<U extends UniformSchema = UniformSchema> {
  private readonly functionNames = new Set<string>();
  private readonly functionStack = new Set<string>();
  private readonly functions: FnDef[] = [];
  readonly uniforms: U;
  readonly constants: ConstStatement[];
  readonly statements: BodyStatement[];

  constructor(
    uniforms: U,
    constants: ConstStatement[] = [],
    statements: BodyStatement[] = [],
  ) {
    this.uniforms = uniforms;
    this.constants = constants;
    this.statements = statements;
  }

  addConstant(constant: ConstStatement): void {
    this.constants.push(constant);
  }

  addStatement(statement: BodyStatement): void {
    this.statements.push(statement);
  }

  build(): ShaderProgram<U> {
    for (const constant of this.constants) this.visitNode(constant.value);
    for (const statement of this.statements) this.visitNode(statement.value);

    return {
      uniforms: this.uniforms,
      constants: this.constants,
      statements: this.statements,
      functions: this.functions,
    };
  }

  private visitNode(node: AstNode): void {
    switch (node.kind) {
      case "fncall":
        for (const argument of node.args) this.visitNode(argument);
        this.visitFunction(node.name);
        return;
      case "call":
        for (const argument of node.args) this.visitNode(argument);
        return;
      case "field":
        this.visitNode(node.expr);
        return;
      case "binop":
        this.visitNode(node.left);
        this.visitNode(node.right);
        return;
      case "unary":
        this.visitNode(node.operand);
        return;
      case "number":
      case "ref":
        return;
    }
  }

  private visitFunction(name: string): void {
    if (this.functionNames.has(name)) return;
    if (this.functionStack.has(name)) {
      throw new Error(
        `Circular dependency detected in shader functions: ${[...this.functionStack, name].join(" → ")}`,
      );
    }

    const definition = getFunctionDefinition(name);
    if (!definition) {
      throw new Error(`Unknown shader function "${name}".`);
    }

    this.functionStack.add(name);
    for (const statement of definition.body) this.visitNode(statement.value);
    this.visitNode(definition.returnExpr);
    this.functionStack.delete(name);
    this.functionNames.add(name);
    this.functions.push(definition);
  }
}

export function buildFunctionProgram(definition: FnDef): ShaderProgram {
  // A standalone function is a root, so walk its body to collect dependencies,
  // then append the root after those dependencies.
  const dependencies = new ProgramBuilder(
    {},
    [],
    [
      ...definition.body,
      { type: "assign" as const, target: "", value: definition.returnExpr },
    ],
  ).build();
  return {
    ...dependencies,
    functions: [...dependencies.functions, definition],
  };
}
