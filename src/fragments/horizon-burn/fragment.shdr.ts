import { fn, Float, Vec2, Vec3, type FragmentFn } from "../../shdr/index.ts";

// Inigo Quilez cosine palette — https://iquilezles.org/articles/palettes/
const palette = fn([Float], Vec3, ([t], { cos, vec3 }) => {
  const a = vec3(0.1);
  const b = vec3(0.8);
  const c = vec3(0.4);
  const d = vec3(0.0, 0.1, 0.2);

  return a.add(b.mul(cos(c.mul(t).add(d).mul(6.28318))));
});

// Simple hash — vec2 → float in [0, 1]
const rand = fn([Vec2], Float, ([n], { vec2, dot, fract, sin }) =>
  fract(sin(dot(n, vec2(12.9898, 4.1414))).mul(43758.5453)),
);

export const fragment: FragmentFn = ({ $, vec2, vec3, vec4, sin, mix }) => {
  const ndc = $.uv.mul(2.0).sub(1.0);
  const scaledUv = ndc.mul(0.06);
  const shiftedUv = scaledUv.sub(0.03);
  const grain = rand(shiftedUv.mul(100.0));

  const waveSeedX = shiftedUv.x.mul(6.0);
  const waveSeedY = shiftedUv.y.mul(6.0);

  const waveX = sin(waveSeedX.add(sin($.time.add(waveSeedY)).mul(0.2)));
  const waveY = sin(waveSeedY.add(sin($.time.add(waveSeedX)).mul(0.2)));
  const warpedUv = shiftedUv.add(vec2(waveX, waveY));

  const paletteInput = warpedUv.x.mul(sin(1.0)).add(warpedUv.y);
  const color = palette(paletteInput);
  const colorGrained = palette(paletteInput.add(grain));
  const blended = mix(colorGrained, color, 0.925);
  const finalColor = mix(vec3(0.0), blended, 0.9);

  $.output(vec4(finalColor, 1.0));
};
