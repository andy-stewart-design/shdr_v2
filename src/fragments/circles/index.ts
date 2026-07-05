import { createShader } from "@shdr/index";
import { fragment } from "./fragment.shdr";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, _gui: GUI) {
  createShader({ canvas, fragment });
}
