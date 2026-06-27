import { fn, Float, Vec2, Vec3, type FragmentFn } from "../../shdr/index.ts";

// Inigo Quilez cosine palette — https://iquilezles.org/articles/palettes/
const palette = fn("palette", [Float], Vec3, ([t], { cos, vec3 }) => {
  let a = vec3(0.1);
  let b = vec3(0.8);
  let c = vec3(0.4);
  let d = vec3(0.0, 0.1, 0.2);

  return a.add(b.mul(cos(c.mul(t).add(d).mul(6.28318))));
});

// Simple hash — vec2 → float in [0, 1]
const rand = fn("rand", [Vec2], Float, ([n], { vec2, dot, fract, sin }) =>
  fract(sin(dot(n, vec2(12.9898, 4.1414))).mul(43758.5453)),
);

export const fragment: FragmentFn = ({ $, vec2, vec3, vec4, sin, mix }) => {
  let ndc = $.let("ndc", $.uv.mul(2.0).sub(1.0));
  let uv1 = $.let("uv1", ndc.mul(0.06));
  let uv2 = $.let("uv2", uv1.sub(0.03));
  let grain = $.let("grain", rand(uv2.mul(100.0)));

  var sX = uv2.x.mul(6.0);
  var sY = uv2.y.mul(6.0);

  let waveX = $.let("waveX", sin(sX.add(sin($.time.add(sY)).mul(0.2))));
  let waveY = $.let("waveY", sin(sY.add(sin($.time.add(sX)).mul(0.2))));
  let uv3 = $.let("uv3", uv2.add(vec2(waveX, waveY)));

  let palInput = $.let("palInput", uv3.x.mul(sin(1.0)).add(uv3.y));
  let color = $.let("color", palette(palInput));
  let colorGrained = $.let("colorGrained", palette(palInput.add(grain)));
  let blended = $.let("blended", mix(colorGrained, color, 0.925));
  let finalColor = $.let("finalColor", mix(vec3(0.0), blended, 0.9));

  $.output(vec4(finalColor, 1.0));
};
