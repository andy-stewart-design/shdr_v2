import "./style.css";
import GUI from "lil-gui";
import { createShader, compileFragment } from "./shdr/index.ts";
import { fragment, dpi } from "./fragments/ben-day-spotlight";

const uniforms = { dpi };

console.log(compileFragment(fragment, { uniforms }));

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

createShader({ canvas, fragment, uniforms });

const params = {
  dpi: uniforms.dpi.get(),
};

const gui = new GUI();
gui.add(params, "dpi", 2, 40, 1).onChange((value: number) => {
  uniforms.dpi.set(value);
});
