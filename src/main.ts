import "./style.css";
import { createShader, compileFragment } from "./shdr/index.ts";
import { fragment } from "./fragments/moby-gradient";

console.log(compileFragment(fragment));

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

createShader({ canvas, fragment });
