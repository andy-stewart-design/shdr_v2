import type { Plugin } from "vite";
import { transformShdrSource } from "./transform/index.ts";

export function shdrPlugin(): Plugin {
  return {
    name: "shdr-transform",
    enforce: "pre",
    transform(code, id) {
      if (!/\.shdr\.tsx?$/.test(id)) return null;
      return transformShdrSource(code, id);
    },
  };
}
