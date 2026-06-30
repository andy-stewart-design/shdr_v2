import { createShader, compileFragment } from "../../shdr/index.ts";
import { fragment } from "./fragment.shdr.ts";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, _gui: GUI) {
  console.log(compileFragment(fragment));
  createShader({ canvas, fragment });
}

export { fragment };
