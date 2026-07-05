import { compileFragment, type FragmentFn } from "../../shdr/index.ts";
import { SPACING_FACTOR } from "./constants.ts";
import { circles } from "./utils.shdr.ts";

const _fragment: FragmentFn = ({
  $,
  vec2,
  vec4,
  step,
  length,
  floor,
  float,
}) => {
  const CENTRAL_RAD = float(0.1);
  const SATELLITE_RAD = float(0.0375);
  const ROTATION_SPEED = 0.15;
  const SPACING = SPACING_FACTOR * 2.0;

  const xy = $.coord.mul(2.0).sub($.resolution).div($.resolution.y);
  const C = vec2(0.0);
  const distFromCenter = length(xy.sub(C));
  const i = floor(
    distFromCenter.sub(CENTRAL_RAD).div(SATELLITE_RAD.mul(SPACING)),
  );
  const phaseOffset = $.time.mul(ROTATION_SPEED).mul(i.mul(0.1).add(1.0)).neg();

  const col = circles({
    xy,
    C,
    R: CENTRAL_RAD.add(SATELLITE_RAD.mul(i).mul(SPACING)),
    r: SATELLITE_RAD,
    ph: phaseOffset,
    resY: $.resolution.y,
  }).mul(step(0.0, i));

  $.output(vec4(col.mul(0.9), 1.0));
};

export const fragment = compileFragment(_fragment);
console.log(fragment);
