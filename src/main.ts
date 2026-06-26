import "./style.css";
import { createShader } from "./shdr/index.ts";
import { fragment } from "./fragments/circles.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

createShader({ canvas, fragment });
