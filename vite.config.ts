import { defineConfig } from "vite";
import { shdrPlugin } from "./src/vite-plugin-shdr.ts";

export default defineConfig({
  plugins: [shdrPlugin()],
});
