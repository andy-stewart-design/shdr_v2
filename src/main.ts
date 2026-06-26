import "./style.css";
import { createShader, compileFragment } from "./shdr/index.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

const fragment = compileFragment(
  ({ $, vec3, vec4, sin, cos, mix, smoothstep }) => {
    // ── Constants ──────────────────────────────────────────────────────────
    const COLOR_GREEN = vec3(76.0 / 255.0, 225.0 / 255.0, 96.0 / 255.0);
    const COLOR_BLUE = vec3(132.0 / 255.0, 180.0 / 255.0, 251.0 / 255.0);
    const COLOR_ORANGE = vec3(255.0 / 255.0, 130.0 / 255.0, 90.0 / 255.0);
    const COLOR_YELLOW = vec3(246.0 / 255.0, 224.0 / 255.0, 22.0 / 255.0);

    const WAVE_FREQ = 5.0;
    const WAVE_AMP = 30.0;
    const WAVE_SPEED = 2.0;

    // ── u_resolution: aspect-correct UV ───────────────────────────────────
    // $.uv is gl_FragCoord / u_resolution, giving [0,1]² regardless of size.
    // We shift to [-0.5, 0.5] and correct the x axis for aspect ratio so the
    // wave pattern doesn't stretch when the window is resized.
    const ar = $.uv.x.div($.uv.y);
    const tuv = $.uv.sub(0.5);
    const tuvAspect = vec3(tuv.x.mul(ar), tuv.y, 0.0);

    // ── u_time: animated wave distortion ──────────────────────────────────
    // $.time advances every frame — drives the wave offset and a slow colour
    // pulse so it's obvious the uniform is live.
    const speed = $.time.mul(WAVE_SPEED);
    const pulse = sin($.time.mul(0.4)).mul(0.5).add(0.5); // [0,1] slow oscillation

    const distX = sin(tuvAspect.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP);
    const distY = cos(tuvAspect.x.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP);

    // ── Layer blending ─────────────────────────────────────────────────────
    const layerBlend = smoothstep(-0.3, 0.2, tuv.x.add(distX));
    const l1 = mix(COLOR_ORANGE, COLOR_BLUE, layerBlend);
    const l2 = mix(COLOR_YELLOW, COLOR_GREEN, layerBlend);

    // pulse slowly cross-fades between the two layer combos over time
    const baseColor = mix(l1, l2, smoothstep(0.5, -0.3, tuv.y.add(distY)));
    const color = mix(baseColor, l2, pulse.mul(0.25));

    $.fragColor(vec4(color, 1.0));
  },
);

console.log(fragment);

// const fragment = compileFragment(
//   ({ $, vec3, vec4, sin, cos, mix, smoothstep }) => {
//     // ── Constants ──────────────────────────────────────────────────────────
//     const COLOR_GREEN = $.const(
//       vec3(76.0 / 255.0, 225.0 / 255.0, 96.0 / 255.0),
//     );
//     const COLOR_BLUE = $.const(
//       vec3(132.0 / 255.0, 180.0 / 255.0, 251.0 / 255.0),
//     );
//     const COLOR_ORANGE = $.const(
//       vec3(255.0 / 255.0, 130.0 / 255.0, 90.0 / 255.0),
//     );
//     const COLOR_YELLOW = $.const(
//       vec3(246.0 / 255.0, 224.0 / 255.0, 22.0 / 255.0),
//     );

//     const WAVE_FREQ = $.const(5.0);
//     const WAVE_AMP = $.const(30.0);
//     const WAVE_SPEED = $.const(2.0);

//     // ── u_resolution: aspect-correct UV ───────────────────────────────────
//     // $.uv is gl_FragCoord / u_resolution, giving [0,1]² regardless of size.
//     // We shift to [-0.5, 0.5] and correct the x axis for aspect ratio so the
//     // wave pattern doesn't stretch when the window is resized.
//     const aspectRatio = $.let($.uv.x.div($.uv.y));
//     const tuv = $.let($.uv.sub(0.5));
//     const tuvAspect = $.let(vec3(tuv.x.mul(aspectRatio), tuv.y, 0.0));

//     // ── u_time: animated wave distortion ──────────────────────────────────
//     // $.time advances every frame — drives the wave offset and a slow colour
//     // pulse so it's obvious the uniform is live.
//     const speed = $.let($.time.mul(WAVE_SPEED));
//     const pulse = $.let(sin($.time.mul(0.4)).mul(0.5).add(0.5)); // [0,1] slow oscillation

//     const distX = $.let(
//       sin(tuvAspect.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP),
//     );
//     const distY = $.let(
//       cos(tuvAspect.x.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP),
//     );

//     // ── Layer blending ─────────────────────────────────────────────────────
//     const layerBlend = $.let(smoothstep(-0.3, 0.2, tuv.x.add(distX)));
//     const layer1 = $.let(mix(COLOR_ORANGE, COLOR_BLUE, layerBlend));
//     const layer2 = $.let(mix(COLOR_YELLOW, COLOR_GREEN, layerBlend));

//     // pulse slowly cross-fades between the two layer combos over time
//     const baseColor = $.let(
//       mix(layer1, layer2, smoothstep(0.5, -0.3, tuv.y.add(distY))),
//     );
//     const color = $.let(mix(baseColor, layer2, pulse.mul(0.25)));

//     $.fragColor(vec4(color, 1.0));
//   },
// );

createShader({ canvas, fragment });
