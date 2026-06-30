import {
  addFloatUniformControl,
  addStringUniformControl,
  addTextureUploadControl,
} from "../../controls.ts";
import { createShader, compileFragment } from "../../shdr/index.ts";
import { fragment, uniforms } from "./fragment.shdr.ts";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, gui: GUI) {
  console.log(compileFragment(fragment, { uniforms }));

  createShader({ canvas, fragment, uniforms });

  addStringUniformControl(gui, "texture", uniforms.texture);
  addTextureUploadControl(gui, "Upload texture", uniforms.texture);
  addFloatUniformControl(gui, "pixelation", uniforms.pixelation, {
    min: 1,
    max: 160,
    step: 1,
    // GUI value is in CSS pixels; shader uniform is in physical pixels.
    toUniform: (value) => value * devicePixelRatio,
    fromUniform: (value) => value / devicePixelRatio,
  });
}

export { fragment, uniforms };
