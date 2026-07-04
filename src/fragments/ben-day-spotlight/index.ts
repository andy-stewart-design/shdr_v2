import { addFloatUniformControl } from "../../controls.ts";
import { createShader, compileFragment } from "../../shdr/index.ts";
import { fragment, uniforms } from "./fragment.shdr.ts";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, gui: GUI) {
  console.log(compileFragment(fragment, { uniforms }));

  createShader({ canvas, fragment, uniforms });

  addFloatUniformControl(gui, "dpi", uniforms.dpi, {
    min: 2,
    max: 40,
    step: 1,
  });
  addFloatUniformControl(gui, "spread", uniforms.spread, {
    min: 0.1,
    max: 1,
    step: 0.01,
  });
  addFloatUniformControl(gui, "blur", uniforms.blur, {
    min: 0,
    max: 10,
    step: 0.1,
  });
}
