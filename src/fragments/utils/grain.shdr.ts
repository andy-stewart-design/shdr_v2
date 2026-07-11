import { fn, Float, Vec2 } from "@shdr/index";

export const filmGrain = fn([Vec2], Float, ([p], { vec3, fract, dot }) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  const d = dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33));
  const q = p3.add(d);

  return fract(q.x.add(q.y).mul(q.z)).mul(2.0).sub(1.0);
});
