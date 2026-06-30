import { addFloatUniformControl } from "../../controls.ts";
import { compileFragment, createShader } from "../../shdr/index.ts";
import { fragment, uniforms } from "./fragment.shdr.ts";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, gui: GUI) {
  console.log(compileFragment(fragment, { uniforms }));

  createShader({ canvas, fragment, uniforms });

  addFloatUniformControl(gui, "scale", uniforms.scale, {
    min: 1,
    max: 20,
    step: 0.1,
  });
  addFloatUniformControl(gui, "speed", uniforms.speed, {
    min: 0,
    max: 3,
    step: 0.05,
  });
  addFloatUniformControl(gui, "complexity", uniforms.complexity, {
    min: 0.5,
    max: 6,
    step: 0.1,
  });
  addFloatUniformControl(gui, "grain", uniforms.grain, {
    min: 0,
    max: 0.5,
    step: 0.01,
  });
}

export { fragment, uniforms };
