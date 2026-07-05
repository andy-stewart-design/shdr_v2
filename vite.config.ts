import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { shdrPlugin } from "./src/vite-plugin-shdr.ts";

export default defineConfig({
  plugins: [shdrPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shdr": fileURLToPath(new URL("./src/shdr", import.meta.url)),
    },
  },
});
