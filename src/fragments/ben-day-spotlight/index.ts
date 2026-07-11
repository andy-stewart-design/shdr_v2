import { createShader } from "@shdr/index";
import { addUniformControls } from "@/controls";
import { fragment, uniforms } from "./fragment.shdr";
import type GUI from "lil-gui";

export function setup(canvas: HTMLCanvasElement, gui: GUI) {
  const shader = createShader({ canvas, fragment, uniforms });
  addUniformControls(gui, shader);
}
