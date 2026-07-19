import { describe, expect, it } from "vitest";
import { toNode } from "./ast.ts";
import { fn } from "./fn.ts";
import { Float } from "./glsl-types.ts";
import { ProgramBuilder } from "./program.ts";

describe("ProgramBuilder", () => {
  it("owns resolved function definitions while call nodes retain only names", () => {
    const double = fn("programTestDouble", [Float], Float, ([value]) =>
      value.mul(2),
    );
    const call = double(3);
    const node = toNode(call);

    expect(node).toEqual({
      kind: "fncall",
      name: "programTestDouble",
      args: [{ kind: "number", value: 3 }],
    });

    const program = new ProgramBuilder(
      {},
      [],
      [{ type: "assign", target: "fragColor", value: node }],
    ).build();

    expect(program.functions.map((definition) => definition.name)).toEqual([
      "programTestDouble",
    ]);
  });
});
