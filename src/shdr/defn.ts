import { makeProxy, refProxy, toNode, glslTypeOf } from "./ast.ts";
import type {
  AstNode,
  ExprProxy,
  FnBodyStatement,
  FnDef,
  GlslType,
  ParamsToExprs,
  ShaderFn,
} from "./types.ts";

// ---------------------------------------------------------------------------
// LocalContext — the $ available inside a defn body
// ---------------------------------------------------------------------------

type LocalContext = {
  /** Declare a named local variable inside the function body. */
  let<T extends GlslType>(name: string, value: ExprProxy<T>): ExprProxy<T>;
  /** Declare an auto-named local variable (_l0, _l1, …). */
  let<T extends GlslType>(value: ExprProxy<T>): ExprProxy<T>;
};

// ---------------------------------------------------------------------------
// defn
// ---------------------------------------------------------------------------

export function defn<
  S extends Record<string, GlslType>,
  R extends GlslType,
>(
  name: string,
  params: S,
  returnType: R,
  body: (args: ParamsToExprs<S>, $: LocalContext) => ExprProxy<R>,
): ShaderFn<S, R> {

  // Build a typed ExprProxy for each declared parameter
  const paramRefs = Object.fromEntries(
    Object.entries(params).map(([key, type]) => [key, refProxy([key], type as GlslType)]),
  ) as unknown as ParamsToExprs<S>;

  // Mini statement collector scoped to this function body
  const localStatements: FnBodyStatement[] = [];
  let localCounter = 0;

  const local$: LocalContext = {
    let<T extends GlslType>(
      nameOrValue: string | ExprProxy<T>,
      maybeValue?: ExprProxy<T>,
    ): ExprProxy<T> {
      const varName =
        typeof nameOrValue === "string" ? nameOrValue : `_l${localCounter++}`;
      const value =
        typeof nameOrValue === "string" ? maybeValue! : nameOrValue;
      localStatements.push({
        type: "let",
        name: varName,
        varType: glslTypeOf(value),
        value: toNode(value),
      });
      return refProxy<T>([varName], glslTypeOf(value) as T);
    },
  };

  // Run the body eagerly to collect statements and capture the return expr
  const returnValue = body(paramRefs, local$);

  const def: FnDef = {
    name,
    params,
    returnType,
    body: localStatements,
    returnExpr: toNode(returnValue),
  };

  // The callable — takes a named-args object, produces a typed FnCallNode
  const fn = ((args: { [K in keyof S]: ExprProxy<S[K]> | number }) => {
    const argNodes: AstNode[] = Object.keys(params).map(
      (k) => toNode(args[k as keyof typeof args] as ExprProxy<GlslType> | number),
    );
    return makeProxy<R>({ kind: "fncall", def, args: argNodes }, returnType);
  }) as ShaderFn<S, R>;

  Object.defineProperty(fn, "_def", { value: def, writable: false });

  return fn;
}
