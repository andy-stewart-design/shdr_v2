import "./style.css";
import {
  createShader,
  compileFragment,
  vec2,
  vec3,
  mul,
} from "./shdr/index.ts";
import { filmGrain, noise, rot } from "./shader-utils.ts";

// ── Shader ────────────────────────────────────────────────────────────────────

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

const fragment = compileFragment(
  ({ $, vec4, sin, mix, smoothstep, radians }) => {
    // ── Constants
    const FILM_GRAIN_INTENSITY = 0.1;
    const COLOR_GREEN = vec3(76 / 255, 225 / 255, 96 / 255);
    const COLOR_BLUE = vec3(132 / 255, 180 / 255, 251 / 255);
    const COLOR_ORANGE = vec3(255 / 255, 130 / 255, 90 / 255);
    const COLOR_YELLOW = vec3(246 / 255, 224 / 255, 22 / 255);
    const ROT_NOISE_SPEED = 0.05;
    const ROT_SPREAD_DEG = 720;
    const ROT_OFFSET_DEG = 180;
    const LAYER_ROT_DEG = -5;
    const WAVE_FREQUENCY = 5;
    const WAVE_AMPLITUDE = 30;
    const WAVE_SPEED = 2;
    const WAVE_Y_FREQ_SCALE = 1.5;
    const WAVE_Y_AMPL_SCALE = 0.5;

    // ── Aspect ratio (u_resolution is available via $.resolution)
    const aspectRatio = $.resolution.x.div($.resolution.y);

    // ── Global rotation that drifts slowly over time
    const tuv0 = $.uv.sub(0.5);
    const degree = noise(vec2($.time.mul(ROT_NOISE_SPEED), tuv0.x.mul(tuv0.y)));

    // Correct for aspect ratio, rotate, then restore — SSA replaces tuv.y *= / tuv *= / tuv.y *=
    const tuv1 = vec2(tuv0.x, tuv0.y.div(aspectRatio));
    const a = radians(degree.sub(0.5).mul(ROT_SPREAD_DEG).add(ROT_OFFSET_DEG));
    const tuv2 = rot(a).mul(tuv1);
    const tuv3 = vec2(tuv2.x, tuv2.y.mul(aspectRatio));

    // ── Wave distortion — SSA replaces tuv.x += / tuv.y +=
    const speed = $.time.mul(WAVE_SPEED);

    const tuv4x = tuv3.x.add(
      sin(tuv3.y.mul(WAVE_FREQUENCY).add(speed)).div(WAVE_AMPLITUDE),
    );
    const tuv4y = tuv3.y.add(
      sin(tuv3.x.mul(WAVE_FREQUENCY).mul(WAVE_Y_FREQ_SCALE).add(speed)).div(
        mul(WAVE_AMPLITUDE, WAVE_Y_AMPL_SCALE),
      ),
    );
    const tuv4 = vec2(tuv4x, tuv4y);

    // ── Layer blending with shared slight rotation
    // Original: (tuv * layerRot).x — vec2 left-multiply, now supported
    const layerRot = rot(radians(LAYER_ROT_DEG));
    const layerBlend = smoothstep(-0.3, 0.2, tuv4.mul(layerRot).x);
    const layer1 = mix(COLOR_ORANGE, COLOR_BLUE, layerBlend);
    const layer2 = mix(COLOR_YELLOW, COLOR_GREEN, layerBlend);
    const color = mix(layer1, layer2, smoothstep(0.5, -0.3, tuv4.y));

    // ── Film grain — SSA replaces color -=
    const grain = filmGrain($.uv);
    const finalColor = color.sub(vec3(grain.mul(FILM_GRAIN_INTENSITY)));

    $.fragColor(vec4(finalColor, 1.0));
  },
);

console.log(fragment);
