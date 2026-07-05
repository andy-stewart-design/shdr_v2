import { filmGrain } from "@/fragments/utils/grain.shdr";
import { noise } from "@/fragments/utils/noise.shdr";
import { vignette } from "@/fragments/utils/vignette.shdr";
import { rot } from "@/fragments/utils/rotate.shdr";
import { compileFragment, type FragmentFn } from "@shdr/index";

const _fragment: FragmentFn = ({
  $,
  vec2,
  vec3,
  vec4,
  sin,
  mix,
  smoothstep,
  radians,
  float,
}) => {
  // ── Constants
  const FILM_GRAIN_INTENSITY = 0.1;
  const VIGNETTE_INTENSITY = 0.125;
  const COLOR_GREEN = vec3(76.0 / 255.0, 225.0 / 255.0, 96.0 / 255.0);
  const COLOR_BLUE = vec3(132.0 / 255.0, 180.0 / 255.0, 251.0 / 255.0);
  const COLOR_ORANGE = vec3(255.0 / 255.0, 130.0 / 255.0, 90.0 / 255.0);
  const COLOR_YELLOW = vec3(246.0 / 255.0, 224.0 / 255.0, 22.0 / 255.0);

  const ROT_NOISE_SPEED = 0.05;
  const ROT_SPREAD_DEG = 720.0;
  const ROT_OFFSET_DEG = 180.0;
  const LAYER_ROT_DEG = -5.0;
  const WAVE_FREQ = 5.0;
  const WAVE_AMP = float(30.0);
  const WAVE_SPEED = 2.0;
  const WAVE_Y_FREQ_SCALE = 1.5;
  const WAVE_Y_AMP_SCALE = 0.5;

  // ── Aspect-correct UV
  const aspectRatio = $.resolution.x.div($.resolution.y);
  const centeredUv = $.uv.sub(0.5);

  // ── Global rotation driven by noise
  const rotationNoise = noise(
    vec2($.time.mul(ROT_NOISE_SPEED), centeredUv.x.mul(centeredUv.y)),
  );
  const rotationAngle = radians(
    rotationNoise.sub(0.5).mul(ROT_SPREAD_DEG).add(ROT_OFFSET_DEG),
  );

  // Correct for aspect ratio, rotate, restore.
  const aspectUv = vec2(centeredUv.x, centeredUv.y.div(aspectRatio));
  const rotatedUv = rot(rotationAngle).mul(aspectUv);
  const correctedUv = vec2(rotatedUv.x, rotatedUv.y.mul(aspectRatio));

  // ── Wave distortion
  const waveTime = $.time.mul(WAVE_SPEED);

  const _xWavePhase = correctedUv.y.mul(WAVE_FREQ).add(waveTime);
  const xWave = sin(_xWavePhase).div(WAVE_AMP);

  const _yWavePhase = correctedUv.x
    .mul(WAVE_FREQ)
    .mul(WAVE_Y_FREQ_SCALE)
    .add(waveTime);
  const yWave = sin(_yWavePhase).div(WAVE_AMP.mul(WAVE_Y_AMP_SCALE));

  const warpedUv = vec2(correctedUv.x.add(xWave), correctedUv.y.add(yWave));

  // ── Layer blending with a shared slight rotation
  const layerRot = rot(radians(LAYER_ROT_DEG));
  const layerBlend = smoothstep(-0.3, 0.2, warpedUv.mul(layerRot).x);
  const layer1 = mix(COLOR_ORANGE, COLOR_BLUE, layerBlend);
  const layer2 = mix(COLOR_YELLOW, COLOR_GREEN, layerBlend);
  const color = mix(layer1, layer2, smoothstep(0.5, -0.3, warpedUv.y));

  const grain = filmGrain($.coord);
  const grainedColor = color.add(grain.mul(FILM_GRAIN_INTENSITY));
  const finalColor = grainedColor.mul(vignette($.uv, VIGNETTE_INTENSITY));

  $.output(vec4(finalColor, 1.0));
};

export const fragment = compileFragment(_fragment);
console.log(fragment);
