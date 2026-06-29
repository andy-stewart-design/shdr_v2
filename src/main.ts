import "./style.css";
import GUI from "lil-gui";
import {
  addFloatUniformControl,
  addStringUniformControl,
  addTextureUploadControl,
} from "./controls.ts";
import { createShader, compileFragment } from "./shdr/index.ts";
import { fragment, uniforms } from "./fragments/pixelation";

console.log(compileFragment(fragment, { uniforms }));

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

createShader({ canvas, fragment, uniforms });

const gui = new GUI();
addStringUniformControl(gui, "texture", uniforms.texture);
addTextureUploadControl(gui, "Upload texture", uniforms.texture);
addFloatUniformControl(gui, "pixelation", uniforms.pixelation, {
  min: 1,
  max: 120,
  step: 1,
  // GUI value is in CSS pixels; shader uniform is in physical pixels.
  toUniform: (value) => value * devicePixelRatio,
  fromUniform: (value) => value / devicePixelRatio,
});
