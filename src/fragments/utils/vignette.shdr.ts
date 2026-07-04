import { fn, Float, Vec2 } from "../../shdr/index.ts";

/**
 * Returns a vignette multiplier for normalized UV coordinates.
 *
 * `amount` is typically 0.0..1.0:
 * - 0.0 = no vignette
 * - 1.0 = strong darkening near corners
 */
export const vignette = fn([Vec2, Float], Float, ([uv, amount], { dot, clamp, pow }) => {
  const centered = uv.sub(0.5);
  const dist = dot(centered, centered);
  const vig = clamp(dist.mul(amount).mul(2.5).neg().add(1.0), 0.0, 1.0);

  return pow(vig, 1.5);
});
