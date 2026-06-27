import { fn, Float, Vec2, Vec3 } from "../../shdr/index.ts";
import { TAU, EP, SPACING_FACTOR } from "./constants.ts";

// ── Helper functions ──────────────────────────────────────────────────────────

const hue = fn("hue", [Vec3], Vec3, ([c], ctx) => {
  var { $, vec3, mod, abs, smoothstep } = ctx;

  let shifted = $.let("shifted", vec3(0, 4, 2).add(c.x.mul(6.0)));
  let wrapped = $.let("wrapped", mod(shifted, 6.0));
  let ss = $.let("ss", smoothstep(2.0, 1.0, abs(wrapped.sub(3.0))));
  let inner = $.let("inner", ss.mul(c.y));
  let factor = $.let("factor", inner.neg().add(1.0));

  return factor.mul(c.z);
});

const circArgs = [Vec2, Vec2, Float, Float, Float] as const;

const circle = fn("circle", circArgs, Float, (args, ctx) => {
  const [xy, c, r, fill, resY] = args;
  const { mix, abs, smoothstep, length, div, sub } = ctx;

  let dist = length(xy.sub(c)).sub(r);
  let edgeDist = mix(abs(dist), dist, fill);

  return sub(1.0, smoothstep(div(-2.0, resY), div(3.0, resY), edgeDist));
});

const circsArgs = {
  xy: Vec2,
  C: Vec2,
  R: Float,
  r: Float,
  ph: Float,
  resY: Float,
} as const;

export const circles = fn(
  "circles",
  circsArgs,
  Vec3,
  (
    args,
    { $, vec2, vec3, sin, cos, mat2, asin, atan, floor, fract, abs, add, div },
  ) => {
    const { xy, C, R, r, ph, resY } = args;

    let t = $.let("t", asin(r.div(R.add(r))).mul(2.0 * SPACING_FACTOR));
    let divv = $.let("divv", abs(div(TAU, t)).add(EP));
    let n = $.let("n", floor(divv));
    let pad = $.let("pad", fract(divv).mul(t).div(n));
    let rt = $.let("rt", t.div(-2.0).sub(pad.div(2.0)).add(ph));
    let rm = $.let("rm", mat2(cos(rt), sin(rt).neg(), sin(rt), cos(rt)));
    let zw = $.let("zw", rm.mul(xy.sub(C)));
    let i = $.let("i", floor(atan(zw.y, zw.x).div(t.add(pad))));
    let angle = $.let("angle", i.mul(t.add(pad)).add(ph));
    let cPos = $.let(
      "cPos",
      add(vec2(cos(angle), sin(angle)).mul(R.add(r)), C),
    );
    let hsl = vec3(i.div(n), 1.0, 0.75);

    return vec3(circle(xy, cPos, r, 1.0, resY)).mul(hue(hsl));
  },
);
