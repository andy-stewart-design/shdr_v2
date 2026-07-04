import { fn, Float, Mat2 } from "../../shdr/index.ts";

export const rot = fn([Float], Mat2, ([a], { sin, cos, mat2 }) => {
  const s = sin(a);
  const c = cos(a);
  return mat2(c, s.neg(), s, c);
});
