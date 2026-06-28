import { uniform, type FragmentFn } from "../../shdr/index.ts";

export const dpi = uniform.float(12);

export const fragment: FragmentFn = ({
  $,
  vec2,
  vec3,
  vec4,
  fract,
  floor,
  length,
  smoothstep,
  step,
  mix,
  min,
  max,
}) => {
  const { dpi } = $.u;
  const SPREAD_FACTOR = $.const("SPREAD_FACTOR", 0.625);
  const SPREAD_AMOUNT = $.const(
    "SPREAD_AMOUNT",
    SPREAD_FACTOR.neg().add(1.0).mul(2.5).add(0.5),
  );
  const BLUR_AMOUNT = $.const("BLUR_AMOUNT", 0.0);

  // Normalize coordinate space.
  let uv0 = $.let("uv0", $.fragCoord.div($.resolution));

  // Use center coordinates if mouse has not moved yet, without branching.
  let mouse0 = $.let(
    "mouse0",
    mix(vec2(0.5), $.mouse.div($.resolution), step(0.0001, length($.mouse))),
  );

  // Remap coordinate space from 0..1 to -1..1.
  let uv1 = $.let("uv1", uv0.mul(2.0).sub(1.0));
  let mouse1 = $.let("mouse1", mouse0.mul(2.0).sub(1.0));

  // Fix aspect ratio of coordinates.
  let aspect = $.let("aspect", $.resolution.x.div($.resolution.y));
  let aspectUv = $.let("aspectUv", vec2(uv1.x.mul(aspect), uv1.y));
  let mouse = $.let("mouse", vec2(mouse1.x.mul(aspect), mouse1.y));

  // Save original coordinate space, then divide into repeating cells.
  let uvScreen = $.let("uvScreen", aspectUv);
  let cellUv = $.let("cellUv", fract(aspectUv.mul(dpi)).mul(2.0).sub(1.0));

  // Calculate the grid cell center in original coordinates.
  let cellIndex = $.let("cellIndex", floor(uvScreen.mul(dpi)));
  let cellCenter = $.let("cellCenter", cellIndex.add(0.5).div(dpi));

  // Distance from each cell center to the mouse spotlight.
  let distFromMouse = $.let("distFromMouse", length(cellCenter.sub(mouse)));
  let darkFactor = $.let(
    "darkFactor",
    min(distFromMouse.mul(SPREAD_AMOUNT), 1.0),
  );

  // Grid parameters. modulateSize was statically 1 in the source shader, so
  // the ternary simplifies to `1.0 - distFromMouse`.
  let blur = $.let("blur", max(0.025, distFromMouse.mul(BLUR_AMOUNT)));
  let rad = $.let("rad", distFromMouse.neg().add(1.0));

  // Create a grid of circles.
  let d0 = $.let("d0", length(cellUv));
  let d = $.let(
    "d",
    smoothstep(rad.sub(blur), rad.add(blur), d0).neg().add(1.0),
  );

  // Final fragment color.
  let rg = $.let("rg", distFromMouse.mul(-0.75).add(0.75));
  let color = $.let("color", vec3(rg, rg, 1.0).mul(d).sub(darkFactor));

  $.output(vec4(color, 1.0));
};
