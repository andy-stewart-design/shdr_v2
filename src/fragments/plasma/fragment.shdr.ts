import { compileFragment, defineUniforms, type FragmentFn } from "@shdr/index";
import { filmGrain } from "@/fragments/utils/grain.shdr";

export const uniforms = defineUniforms((u) => ({
  scale: u.float(6.0, { min: 1, max: 20, step: 0.1 }),
  speed: u.float(0.8, { min: 0, max: 3, step: 0.05 }),
  complexity: u.float(2.0, { min: 0.5, max: 6, step: 0.1 }),
  grain: u.float(0.12, { min: 0, max: 0.5, step: 0.01 }),
  colorA: u.vec3([0.1, 0.3, 0.8]),
  colorB: u.vec3([0.9, 0.2, 0.5]),
}));

const _fragment: FragmentFn<typeof uniforms> = ({
  $,
  vec2,
  vec4,
  sin,
  cos,
  sqrt,
  mix,
}) => {
  const uv = $.coord.div($.resolution);
  const t = $.time.mul($.u.speed);

  // Classic plasma field: layered sine waves over centered UV space.
  const c0 = uv.mul($.u.scale).sub($.u.scale.div(2.0));
  const waveX = sin(c0.x.add(t));
  const waveY = sin(c0.y.add(t).div(2.0));
  const waveDiagonal = sin(c0.x.add(c0.y).add(t).div(2.0));

  const drift = vec2(sin(t.div(3.0)), cos(t.div(2.0))).mul($.u.scale.div(2.0));
  const c = c0.add(drift);
  const radial = sqrt(c.x.mul(c.x).add(c.y.mul(c.y)).add(1.0));
  const waveRadial = sin(radial.add(t));

  const plasma = waveX.add(waveY).add(waveDiagonal).add(waveRadial).div(2.0);
  const colorMix = sin(plasma.mul(3.14159).mul($.u.complexity))
    .mul(0.5)
    .add(0.5);
  const color = mix($.u.colorA, $.u.colorB, colorMix);

  // Static screen-space film grain, applied after the plasma color.
  const gr = filmGrain($.coord);
  const finalColor = color.add(gr.mul($.u.grain));

  $.output(vec4(finalColor, 1.0));
};

export const fragment = compileFragment(_fragment, { uniforms });
console.log(fragment);
