import "./style.css";
import GUI from "lil-gui";
import { addFloatUniformControl } from "./controls.ts";
import { createShader, compileFragment } from "./shdr/index.ts";
import { fragment, uniforms } from "./fragments/ben-day-spotlight";

console.log(compileFragment(fragment, { uniforms }));

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

createShader({ canvas, fragment, uniforms });

const gui = new GUI();
addFloatUniformControl(gui, "dpi", uniforms.dpi, { min: 2, max: 40, step: 1 });
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
