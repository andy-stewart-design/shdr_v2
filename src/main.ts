import "./style.css";
import GUI from "lil-gui";
import { addFloatUniformControl } from "./controls.ts";
import { createShader, compileFragment } from "./shdr/index.ts";
import { fragment, uniforms } from "./fragments/pixelation";

console.log(compileFragment(fragment, { uniforms }));

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

createShader({ canvas, fragment, uniforms });

const gui = new GUI();
addFloatUniformControl(gui, "pixelation", uniforms.pixelation, {
  min: 1,
  max: 160,
  step: 1,
});
