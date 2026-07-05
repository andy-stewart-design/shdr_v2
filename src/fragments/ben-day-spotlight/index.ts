import { addUniformControls } from "../../controls.ts";
import { createShader, compileFragment } from "../../shdr/index.ts";
import { fragment, uniforms } from "./fragment.shdr.ts";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, gui: GUI) {
  console.log(compileFragment(fragment, { uniforms }));

  const shader = createShader({ canvas, fragment, uniforms });

  addUniformControls(gui, shader);
}
