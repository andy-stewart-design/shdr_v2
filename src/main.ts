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
