import { createShader } from "@shdr/webgl";
import { addUniformControls } from "@/controls";
import { shader as compiledShader } from "./fragment.shdr";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, gui: GUI) {
  const shader = createShader({ canvas, shader: compiledShader });
  addUniformControls(gui, shader);
}
