import { glslTypeOfNode } from "./ast";
import type { ShaderProgram } from "./program";
import type { AstNode, FnDef, GlslType } from "./types";

const FLOAT_TYPES = new Set<GlslType>(["float", "vec2", "vec3", "vec4"]);
const VECTOR_TYPES = new Set<GlslType>(["vec2", "vec3", "vec4"]);
const SWIZZLE_CHANNELS: Record<string, string> = {
  vec2: "xyrg",
  vec3: "xyzrgb",
  vec4: "xyzwrgba",
};

type BuiltinSignature = {
  validate(args: GlslType[], result: GlslType): string | undefined;
};

function sameGenFloat(args: GlslType[], result: GlslType): string | undefined {
  if (!args.every((type) => FLOAT_TYPES.has(type)))
    return "expects float or float-vector arguments";
  if (args.some((type) => type !== "float" && type !== result))
    return "requires vector arguments to match the result type";
}

function unaryGenFloat(args: GlslType[], result: GlslType) {
  return args.length === 1 && args[0] === result && FLOAT_TYPES.has(result)
    ? undefined
    : "expects one float or float-vector argument";
}

function hasMatchingGenFloatArgs(args: GlslType[], result: GlslType): boolean {
  return sameGenFloat(args, result) === undefined;
}

const unaryGenFloatNames = new Set([
  "sin",
  "cos",
  "asin",
  "acos",
  "abs",
  "sqrt",
  "floor",
  "ceil",
  "sign",
  "fract",
  "exp",
  "exp2",
  "log",
  "log2",
]);

/** One registry used by compiler validation for all GLSL builtin calls. */
export const builtinSignatures: Readonly<Record<string, BuiltinSignature>> = {
  float: {
    validate: (args, result) =>
      args.length === 1 && args[0] === "float" && result === "float"
        ? undefined
        : "expects one float argument",
  },
  vec2: {
    validate: (args, result) =>
      result === "vec2" &&
      ((args.length === 1 && ["float", "vec2"].includes(args[0])) ||
        (args.length === 2 && args.every((type) => type === "float")))
        ? undefined
        : "expects one float/vec2 or two float arguments",
  },
  vec3: {
    validate: (args, result) =>
      result === "vec3" &&
      ((args.length === 1 && ["float", "vec3"].includes(args[0])) ||
        (args.length === 2 &&
          ((args[0] === "vec2" && args[1] === "float") ||
            (args[0] === "float" && args[1] === "vec2"))) ||
        (args.length === 3 && args.every((type) => type === "float")))
        ? undefined
        : "expects float components or a compatible vec2 combination",
  },
  vec4: {
    validate: (args, result) =>
      result === "vec4" &&
      ((args.length === 1 && ["float", "vec4"].includes(args[0])) ||
        (args.length === 2 &&
          ((args[0] === "vec3" && args[1] === "float") ||
            (args[0] === "float" && args[1] === "vec3") ||
            (args[0] === "vec2" && args[1] === "vec2"))) ||
        (args.length === 3 &&
          ((args[0] === "vec2" && args[1] === "float" && args[2] === "float") ||
            (args[0] === "float" &&
              args[1] === "vec2" &&
              args[2] === "float"))) ||
        (args.length === 4 && args.every((type) => type === "float")))
        ? undefined
        : "expects float components or compatible vec2/vec3 combinations",
  },
  mat2: {
    validate: (args, result) =>
      result === "mat2" &&
      ((args.length === 2 && args.every((type) => type === "vec2")) ||
        (args.length === 4 && args.every((type) => type === "float")))
        ? undefined
        : "expects two vec2 arguments or four float arguments",
  },
  texture: {
    validate: (args, result) =>
      args.length === 2 &&
      args[0] === "sampler2D" &&
      args[1] === "vec2" &&
      result === "vec4"
        ? undefined
        : "expects sampler2D and vec2 arguments",
  },
  radians: {
    validate: (args, result) =>
      args.length === 1 && args[0] === "float" && result === "float"
        ? undefined
        : "expects one float argument",
  },
  normalize: {
    validate: (args, result) =>
      args.length === 1 && VECTOR_TYPES.has(args[0]) && args[0] === result
        ? undefined
        : "expects one vector argument",
  },
  dot: {
    validate: (args, result) =>
      args.length === 2 &&
      VECTOR_TYPES.has(args[0]) &&
      args[0] === args[1] &&
      result === "float"
        ? undefined
        : "expects two vectors of the same type",
  },
  length: {
    validate: (args, result) =>
      args.length === 1 && VECTOR_TYPES.has(args[0]) && result === "float"
        ? undefined
        : "expects one vector argument",
  },
  cross: {
    validate: (args, result) =>
      args.length === 2 &&
      args[0] === "vec3" &&
      args[1] === "vec3" &&
      result === "vec3"
        ? undefined
        : "expects two vec3 arguments",
  },
  mix: {
    validate: (args, result) =>
      args.length === 3 &&
      args[2] === "float" &&
      hasMatchingGenFloatArgs(args.slice(0, 2), result)
        ? undefined
        : "expects matching float/vector values and a float interpolation factor",
  },
  smoothstep: {
    validate: (args, result) =>
      args.length === 3 && hasMatchingGenFloatArgs(args, result)
        ? undefined
        : "expects scalar-compatible edges and a float/vector value",
  },
  step: {
    validate: (args, result) =>
      args.length === 2 && hasMatchingGenFloatArgs(args, result)
        ? undefined
        : "expects a scalar-compatible edge and float/vector value",
  },
  mod: {
    validate: (args, result) =>
      args.length === 2 && hasMatchingGenFloatArgs(args, result)
        ? undefined
        : "expects float/vector values with a scalar-compatible divisor",
  },
  min: {
    validate: (args, result) =>
      args.length === 2 ? sameGenFloat(args, result) : "expects two arguments",
  },
  max: {
    validate: (args, result) =>
      args.length === 2 ? sameGenFloat(args, result) : "expects two arguments",
  },
  clamp: {
    validate: (args, result) =>
      args.length === 3 && hasMatchingGenFloatArgs(args, result)
        ? undefined
        : "expects a float/vector value and scalar-compatible bounds",
  },
  pow: {
    validate: (args, result) =>
      args.length === 2 && hasMatchingGenFloatArgs(args, result)
        ? undefined
        : "expects a float/vector base and scalar-compatible exponent",
  },
  reflect: {
    validate: (args, result) =>
      args.length === 2 &&
      args[0] === args[1] &&
      args[0] === result &&
      FLOAT_TYPES.has(result)
        ? undefined
        : "expects matching float/vector incident and normal values",
  },
  atan: {
    validate: (args, result) =>
      (args.length === 1 || args.length === 2) &&
      hasMatchingGenFloatArgs(args, result)
        ? undefined
        : "expects one or two float/vector arguments",
  },
};

function validateBuiltin(
  name: string,
  args: GlslType[],
  result: GlslType,
): void {
  const signature = unaryGenFloatNames.has(name)
    ? { validate: unaryGenFloat }
    : builtinSignatures[name];
  if (!signature) throw new Error(`Unknown GLSL builtin "${name}".`);
  const problem = signature.validate(args, result);
  if (problem) throw new Error(`Invalid ${name}(...) call: ${problem}.`);
}

function validateArithmetic(
  op: string,
  left: GlslType,
  right: GlslType,
  result: GlslType,
): void {
  if (left === "sampler2D" || right === "sampler2D")
    throw new Error(`Invalid ${op} operation on sampler2D values.`);
  if (
    op === "*" &&
    ((left === "mat2" && right === "vec2") ||
      (left === "vec2" && right === "mat2"))
  ) {
    if (result === "vec2") return;
  } else if (left === right && result === left) {
    return;
  } else if (left === "float" && result === right) {
    return;
  } else if (right === "float" && result === left) {
    return;
  }
  throw new Error(
    `Invalid ${left} ${op} ${right} operation producing ${result}.`,
  );
}

function validateNode(node: AstNode, functions: Map<string, FnDef>): void {
  const result = glslTypeOfNode(node);
  switch (node.kind) {
    case "number":
    case "ref":
      return;
    case "field": {
      validateNode(node.expr, functions);
      const baseType = glslTypeOfNode(node.expr);
      const channels = SWIZZLE_CHANNELS[baseType];
      if (
        !channels ||
        node.field.length < 1 ||
        node.field.length > 4 ||
        [...node.field].some((channel) => !channels.includes(channel))
      ) {
        throw new Error(`Invalid ${node.field} swizzle on ${baseType}.`);
      }
      return;
    }
    case "call": {
      for (const argument of node.args) validateNode(argument, functions);
      validateBuiltin(node.name, node.args.map(glslTypeOfNode), result);
      return;
    }
    case "binop":
      validateNode(node.left, functions);
      validateNode(node.right, functions);
      validateArithmetic(
        node.op,
        glslTypeOfNode(node.left),
        glslTypeOfNode(node.right),
        result,
      );
      return;
    case "unary":
      validateNode(node.operand, functions);
      if (glslTypeOfNode(node.operand) === "sampler2D")
        throw new Error("Invalid unary operation on sampler2D value.");
      return;
    case "fncall": {
      const definition = functions.get(node.name);
      if (!definition)
        throw new Error(`Unknown shader function "${node.name}".`);
      const params = Object.entries(definition.params);
      if (node.args.length !== params.length)
        throw new Error(
          `Function "${node.name}" expects ${params.length} arguments, received ${node.args.length}.`,
        );
      node.args.forEach((argument, index) => {
        validateNode(argument, functions);
        const [paramName, paramType] = params[index];
        if (glslTypeOfNode(argument) !== paramType)
          throw new Error(
            `Function "${node.name}" parameter "${paramName}" expects ${paramType}, received ${glslTypeOfNode(argument)}.`,
          );
      });
      if (result !== definition.returnType)
        throw new Error(
          `Function "${node.name}" has inconsistent return type ${result}.`,
        );
    }
  }
}

/** Validate all semantic invariants before a target emitter sees the program. */
export function validateProgram(program: ShaderProgram): void {
  const functions = new Map(
    program.functions.map((definition) => [definition.name, definition]),
  );
  const symbols = new Set<string>();
  for (const constant of program.constants) {
    if (symbols.has(constant.name))
      throw new Error(`Duplicate shader symbol "${constant.name}".`);
    symbols.add(constant.name);
    validateNode(constant.value, functions);
  }
  for (const statement of program.statements) {
    if (statement.type === "let") {
      if (symbols.has(statement.name))
        throw new Error(`Duplicate shader symbol "${statement.name}".`);
      symbols.add(statement.name);
    }
    validateNode(statement.value, functions);
    if (
      statement.type === "assign" &&
      glslTypeOfNode(statement.value) !== "vec4"
    )
      throw new Error("Shader output must be a vec4 expression.");
  }
  for (const definition of program.functions) {
    for (const statement of definition.body)
      validateNode(statement.value, functions);
    validateNode(definition.returnExpr, functions);
  }
}
