import type { FragmentFn } from "../../shdr/index.ts";
import { SPACING_FACTOR } from "./constants.ts";
import { circles } from "./utils.ts";

export const fragment: FragmentFn = (ctx) => {
  var { $, vec2, vec4, step, length, floor } = ctx;

  const CENTRAL_RAD = $.const("CENTRAL_RAD", 0.1);
  const SATELLITE_RAD = $.const("SATELLITE_RAD", 0.0375);
  const ROTATION_SPEED = $.const("ROTATION_SPEED", 0.15);
  const SPACING = $.const("SPACING", SPACING_FACTOR * 2.0);

  let xy = $.let(
    "xy",
    $.fragCoord.mul(2.0).sub($.resolution).div($.resolution.y),
  );
  let C = $.let("C", vec2(0.0));
  let distFromCenter = $.let("distFromCenter", length(xy.sub(C)));
  let i = $.let(
    "i",
    floor(distFromCenter.sub(CENTRAL_RAD).div(SATELLITE_RAD.mul(SPACING))),
  );
  let phaseOffset = $.let(
    "phaseOffset",
    $.time.mul(ROTATION_SPEED).mul(i.mul(0.1).add(1.0)).neg(),
  );

  let col = $.let(
    "col",
    circles({
      xy,
      C,
      R: CENTRAL_RAD.add(SATELLITE_RAD.mul(i).mul(SPACING)),
      r: SATELLITE_RAD,
      ph: phaseOffset,
      resY: $.resolution.y,
    }).mul(step(0.0, i)),
  );

  $.output(vec4(col.mul(0.9), 1.0));
};
