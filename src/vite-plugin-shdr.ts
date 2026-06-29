import type { Plugin } from "vite";
import { transformShdrSource } from "./transform/index.ts";

export function shdrPlugin(): Plugin {
  return {
    name: "shdr-transform",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".ts") && !id.endsWith(".tsx")) return null;
      return transformShdrSource(code, id);
    },
  };
}
