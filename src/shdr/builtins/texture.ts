import { makeCall } from "../ast.ts";
import type { Expr, ExprProxy } from "../types.ts";

export function texture(
  sampler: Expr<"sampler2D">,
  uv: Expr<"vec2">,
): ExprProxy<"vec4"> {
  return makeCall("texture", [sampler, uv], "vec4");
}
