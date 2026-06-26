import { rot, noise, filmGrain } from "../shader-utils.ts";
import type { FragmentFn } from "../shdr/index.ts";

export const fragment: FragmentFn = ({
  $,
  vec2,
  vec3,
  vec4,
  sin,
  mix,
  smoothstep,
  radians,
}) => {
  // ── Constants
  const FILM_GRAIN_INTENSITY = $.const("FILM_GRAIN_INTENSITY", 0.1);
  const COLOR_GREEN = $.const(
    "COLOR_GREEN",
    vec3(76.0 / 255.0, 225.0 / 255.0, 96.0 / 255.0),
  );
  const COLOR_BLUE = $.const(
    "COLOR_BLUE",
    vec3(132.0 / 255.0, 180.0 / 255.0, 251.0 / 255.0),
  );
  const COLOR_ORANGE = $.const(
    "COLOR_ORANGE",
    vec3(255.0 / 255.0, 130.0 / 255.0, 90.0 / 255.0),
  );
  const COLOR_YELLOW = $.const(
    "COLOR_YELLOW",
    vec3(246.0 / 255.0, 224.0 / 255.0, 22.0 / 255.0),
  );

  const ROTATION_NOISE_SPEED = $.const("ROTATION_NOISE_SPEED", 0.05);
  const ROTATION_SPREAD_DEG = $.const("ROTATION_SPREAD_DEG", 720.0);
  const ROTATION_OFFSET_DEG = $.const("ROTATION_OFFSET_DEG", 180.0);
  const LAYER_ROTATION_DEG = $.const("LAYER_ROTATION_DEG", -5.0);
  const WAVE_FREQUENCY = $.const("WAVE_FREQUENCY", 5.0);
  const WAVE_AMPLITUDE = $.const("WAVE_AMPLITUDE", 30.0);
  const WAVE_SPEED = $.const("WAVE_SPEED", 2.0);
  const WAVE_Y_FREQ_SCALE = $.const("WAVE_Y_FREQ_SCALE", 1.5);
  const WAVE_Y_AMPL_SCALE = $.const("WAVE_Y_AMPL_SCALE", 0.5);

  // ── Aspect-correct UV
  const aspectRatio = $.let("aspectRatio", $.resolution.x.div($.resolution.y));
  const tuv0 = $.let("tuv", $.uv.sub(0.5));

  // ── Global rotation driven by noise
  const degree = $.let(
    "degree",
    noise(vec2($.time.mul(ROTATION_NOISE_SPEED), tuv0.x.mul(tuv0.y))),
  );
  const angle = radians(
    degree.sub(0.5).mul(ROTATION_SPREAD_DEG).add(ROTATION_OFFSET_DEG),
  );

  // Correct for aspect ratio, rotate, restore — SSA replaces tuv.y *= / tuv *= / tuv.y *=
  const tuv1 = $.let("tuv1", vec2(tuv0.x, tuv0.y.div(aspectRatio)));
  const tuv2 = $.let("tuv2", rot(angle).mul(tuv1));
  const tuv3 = $.let("tuv3", vec2(tuv2.x, tuv2.y.mul(aspectRatio)));

  // ── Wave distortion — SSA replaces tuv.x += / tuv.y +=
  const speed = $.let("speed", $.time.mul(WAVE_SPEED));
  const tuv4 = $.let(
    "tuv4",
    vec2(
      tuv3.x.add(
        sin(tuv3.y.mul(WAVE_FREQUENCY).add(speed)).div(WAVE_AMPLITUDE),
      ),
      tuv3.y.add(
        sin(tuv3.x.mul(WAVE_FREQUENCY).mul(WAVE_Y_FREQ_SCALE).add(speed)).div(
          WAVE_AMPLITUDE.mul(WAVE_Y_AMPL_SCALE),
        ),
      ),
    ),
  );

  // ── Layer blending with a shared slight rotation
  const layerRot = $.let("layerRot", rot(radians(LAYER_ROTATION_DEG)));
  const layerBlend = $.let(
    "layerBlend",
    smoothstep(-0.3, 0.2, tuv4.mul(layerRot).x),
  );
  const layer1 = $.let("layer1", mix(COLOR_ORANGE, COLOR_BLUE, layerBlend));
  const layer2 = $.let("layer2", mix(COLOR_YELLOW, COLOR_GREEN, layerBlend));
  const color = $.let(
    "color",
    mix(layer1, layer2, smoothstep(0.5, -0.3, tuv4.y)),
  );

  // ── Film grain — static (no u_time), baked into the gradient
  const grain = $.let("grain", filmGrain($.uv));
  const finalColor = $.let(
    "finalColor",
    color.sub(vec3(grain.mul(FILM_GRAIN_INTENSITY))),
  );

  $.output(vec4(finalColor, 1.0));
};
