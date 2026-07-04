import { fn, Vec2 } from "../../shdr";

export const hash = fn([Vec2], Vec2, ([p], ctx) => {
  const { vec2, dot, fract, sin } = ctx;

  const q = vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37)));
  return fract(sin(q).mul(43758.5453));
});
