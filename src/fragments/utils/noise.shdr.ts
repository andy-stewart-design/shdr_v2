import { fn, Float, Vec2 } from "@shdr/index";
import { hash } from "./hash.shdr";

export const noise = fn([Vec2], Float, ([p], ctx) => {
  const { floor, fract, vec2, mix, dot } = ctx;

  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(2.0).sub(3.0).neg());

  const v00 = vec2(0.0, 0.0);
  const v10 = vec2(1.0, 0.0);
  const v01 = vec2(0.0, 1.0);
  const v11 = vec2(1.0, 1.0);

  const g00 = hash(i.add(v00)).mul(2.0).sub(1.0);
  const g10 = hash(i.add(v10)).mul(2.0).sub(1.0);
  const g01 = hash(i.add(v01)).mul(2.0).sub(1.0);
  const g11 = hash(i.add(v11)).mul(2.0).sub(1.0);

  const d00 = dot(g00, f.sub(v00));
  const d10 = dot(g10, f.sub(v10));
  const d01 = dot(g01, f.sub(v01));
  const d11 = dot(g11, f.sub(v11));

  return mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y)
    .mul(0.5)
    .add(0.5);
});
