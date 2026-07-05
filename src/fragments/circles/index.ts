import { createShader } from "../../shdr/index.ts";
import { fragment } from "./fragment.shdr.ts";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, _gui: GUI) {
  createShader({ canvas, fragment });
}
