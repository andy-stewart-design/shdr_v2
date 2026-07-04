import { parseSync } from "oxc-parser";
import type { Program } from "oxc-parser";

export type ParsedShdrModule = {
  program: Program;
};

export function parseModule(code: string, id: string): ParsedShdrModule {
  const result = parseSync(id, code, { sourceType: "module" });
  if (result.errors.length > 0) {
    throw new Error(
      `Failed to parse ${id}:\n${result.errors.map((e) => e.message).join("\n")}`,
    );
  }
  return { program: result.program };
}
