import { addUniformControls } from "../../controls.ts";
import { createShader } from "../../shdr/index.ts";
import { fragment, uniforms } from "./fragment.shdr.ts";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, gui: GUI) {
  const shader = createShader({ canvas, fragment, uniforms });
  addUniformControls(gui, shader);
}
