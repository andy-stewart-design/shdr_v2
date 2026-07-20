import { describe, expect, it } from "vitest";
import { makeCall } from "./ast.ts";
import { texture } from "./builtins/index.ts";
import { compileFragment } from "./compile.ts";
import { fn } from "./fn.ts";
import { Float } from "./glsl-types.ts";
import type { Expr, ExprProxy } from "./types.ts";

describe("compiler semantic validation", () => {
  it("rejects invalid swizzles before GLSL emission", () => {
    expect(() =>
      compileFragment(({ $, vec4 }) => {
        const invalid = ($.uv as unknown as Record<string, ExprProxy<"vec3">>)[
          "xyz"
        ];
        $.output(vec4(invalid, 1));
      }),
    ).toThrow("Invalid xyz swizzle on vec2.");
  });

  it("rejects invalid builtin operand types", () => {
    expect(() =>
      compileFragment(({ $, vec4 }) => {
        const invalid = texture($.time as unknown as Expr<"sampler2D">, $.uv);
        $.output(vec4(invalid.rgb, 1));
      }),
    ).toThrow(
      "Invalid texture(...) call: expects sampler2D and vec2 arguments.",
    );
  });

  it("rejects duplicate local symbols", () => {
    expect(() =>
      compileFragment(({ $, vec4 }) => {
        $.let("value", $.time);
        $.let("value", $.time);
        $.output(vec4(1, 1, 1, 1));
      }),
    ).toThrow('Duplicate shader symbol "value".');
  });

  it("rejects function calls with the wrong arity", () => {
    const identity = fn("semanticIdentity", [Float], Float, ([value]) => value);
    const callWithoutArgument = identity as unknown as () => ExprProxy<"float">;

    expect(() =>
      compileFragment(({ $, vec4 }) => {
        $.output(vec4(callWithoutArgument(), 0, 0, 1));
      }),
    ).toThrow('Function "semanticIdentity" expects 1 arguments, received 0.');
  });

  it("rejects unregistered builtin calls", () => {
    expect(() =>
      compileFragment(({ $ }) => {
        $.output(makeCall("notAGlslBuiltin", [], "vec4"));
      }),
    ).toThrow('Unknown GLSL builtin "notAGlslBuiltin".');
  });
});
