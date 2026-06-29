import { uniform, type FragmentFn } from "../../shdr/index.ts";

export const uniforms = {
  dpi: uniform.float(12),
};

export const fragment: FragmentFn<typeof uniforms> = ({
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
  const SPREAD_FACTOR = 0.625;
  const SPREAD_AMOUNT = 0.5 + 2.5 * (1.0 - SPREAD_FACTOR);
  const BLUR_AMOUNT = 0.0;

  // Normalize coordinate space.
  const uv0 = $.fragCoord.div($.resolution);

  // Use center coordinates if mouse has not moved yet, without branching.
  const mouse0 = mix(
    vec2(0.5),
    $.mouse.div($.resolution),
    step(0.0001, length($.mouse)),
  );

  // Remap coordinate space from 0..1 to -1..1.
  const uv1 = uv0.mul(2.0).sub(1.0);
  const mouse1 = mouse0.mul(2.0).sub(1.0);

  // Fix aspect ratio of coordinates.
  const aspect = $.resolution.x.div($.resolution.y);
  const aspectUv = vec2(uv1.x.mul(aspect), uv1.y);
  const mouse = vec2(mouse1.x.mul(aspect), mouse1.y);

  // Save original coordinate space, then divide into repeating cells.
  const uvScreen = aspectUv;
  const cellUv = fract(aspectUv.mul(dpi)).mul(2.0).sub(1.0);

  // Calculate the grid cell center in original coordinates.
  const cellIndex = floor(uvScreen.mul(dpi));
  const cellCenter = cellIndex.add(0.5).div(dpi);

  // Distance from each cell center to the mouse spotlight.
  const distFromMouse = length(cellCenter.sub(mouse));
  const darkFactor = min(distFromMouse.mul(SPREAD_AMOUNT), 1.0);

  // Grid parameters. modulateSize was statically 1 in the source shader, so
  // the ternary simplifies to `1.0 - distFromMouse`.
  const blur = max(0.025, distFromMouse.mul(BLUR_AMOUNT));
  const rad = distFromMouse.neg().add(1.0);

  // Create a grid of circles.
  const d0 = length(cellUv);
  const d = smoothstep(rad.sub(blur), rad.add(blur), d0).neg().add(1.0);

  // Final fragment color.
  const rg = distFromMouse.mul(-0.75).add(0.75);
  const color = vec3(rg, rg, 1.0).mul(d).sub(darkFactor);

  $.output(vec4(color, 1.0));
};
