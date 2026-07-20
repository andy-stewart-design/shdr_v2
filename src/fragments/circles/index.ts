import { createShader } from "@shdr/webgl";
import { shader } from "./fragment.shdr";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, _gui: GUI) {
  createShader({ canvas, shader });
}
