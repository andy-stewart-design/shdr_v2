import { fnBuiltins } from "./builtins";
import { createLocalContext, type LocalContext } from "./local";
import type { FnBodyStatement } from "../types";

/** The context object passed as the second argument to fn body callbacks.
 *  Mirrors the compileFragment callback context: destructure what you need.
 *  @example
 *  const rot = fn("rot", [Float], Mat2, ([a], { sin, cos, mat2 }) => {
 *    return mat2(cos(a), sin(a).neg(), sin(a), cos(a));
 *  });
 */
export type FnContext = { $: LocalContext } & typeof fnBuiltins;

export function createFnContext(): {
  ctx: FnContext;
  statements: FnBodyStatement[];
} {
  const locals = createLocalContext({ prefix: "_l" });

  return {
    ctx: { $: locals.context, ...fnBuiltins },
    statements: locals.statements,
  };
}
