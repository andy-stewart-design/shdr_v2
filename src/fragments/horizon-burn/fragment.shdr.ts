import { fn, Float, Vec3, type FragmentFn } from "../../shdr/index.ts";
import { filmGrain } from "../utils/grain.shdr.ts";

// Inigo Quilez cosine palette — https://iquilezles.org/articles/palettes/
const palette = fn([Float], Vec3, ([t], { cos, vec3 }) => {
  const a = vec3(0.1);
  const b = vec3(0.8);
  const c = vec3(0.4);
  const d = vec3(0.0, 0.1, 0.2);

  return a.add(b.mul(cos(c.mul(t).add(d).mul(6.28318))));
});

export const fragment: FragmentFn = ({ $, vec2, vec3, vec4, sin, mix }) => {
  const GRAIN_AMOUNT = 0.1;
  const DITHER_AMOUNT = 0.005;
  const DITHER_SEED = 123.456;

  const ndc = $.uv.mul(2.0).sub(1.0);
  const scaledUv = ndc.mul(0.06);
  const shiftedUv = scaledUv.sub(0.03);

  const waveSeedX = shiftedUv.x.mul(6.0);
  const waveSeedY = shiftedUv.y.mul(6.0);

  const waveX = sin(waveSeedX.add(sin($.time.add(waveSeedY)).mul(0.2)));
  const waveY = sin(waveSeedY.add(sin($.time.add(waveSeedX)).mul(0.2)));
  const warpedUv = shiftedUv.add(vec2(waveX, waveY));

  const paletteInput = warpedUv.x.mul(sin(1.0)).add(warpedUv.y);
  const color = palette(paletteInput);

  const grainedColor = color.add(filmGrain($.coord).mul(GRAIN_AMOUNT));
  const gradedColor = mix(vec3(0.0), grainedColor, 0.85);

  // Tiny final output dither to reduce banding.
  const dither = filmGrain($.coord.add(DITHER_SEED)).mul(DITHER_AMOUNT);
  const finalColor = gradedColor.add(dither);

  $.output(vec4(finalColor, 1.0));
};
