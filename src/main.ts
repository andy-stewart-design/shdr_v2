import "./style.css";
import GUI from "lil-gui";
import { setup } from "./fragments/pixelation";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const gui = new GUI();
setup(canvas, gui);
