import { fn, Float, Vec2, Vec3 } from "../shdr/index.ts";
import type { FragmentFn } from "../shdr/index.ts";

// ── Mathematical constants (JS level — inlined as literals) ───────────────────

const TAU            = 6.28318;
const EP             = 0.01;
const SPACING_FACTOR = 1.25;

// ── Helper functions ──────────────────────────────────────────────────────────

const hue = fn("hue", [Vec3], Vec3, ([c], { $, vec3, mod, abs, smoothstep }) => {
  const shifted = $.let("shifted", vec3(0, 4, 2).add(c.x.mul(6.0)));
  const wrapped = $.let("wrapped", mod(shifted, 6.0));
  const ss      = $.let("ss",      smoothstep(2.0, 1.0, abs(wrapped.sub(3.0))));
  const inner   = $.let("inner",   ss.mul(c.y));
  const factor  = $.let("factor",  inner.neg().add(1.0));
  return factor.mul(c.z);
});

const circle = fn("circle", [Vec2, Vec2, Float, Float, Float], Float, ([xy, c, r, fill, resY], { mix, abs, smoothstep, length, div, sub }) => {
  const dist     = length(xy.sub(c)).sub(r);
  const edgeDist = mix(abs(dist), dist, fill);
  return sub(1.0, smoothstep(div(-2.0, resY), div(3.0, resY), edgeDist));
});

const circles = fn("circles", [Vec2, Vec2, Float, Float, Float, Float], Vec3, ([xy, C, R, r, ph, resY], { $, vec2, vec3, sin, cos, mat2, asin, atan, floor, fract, abs, add, div }) => {
  const t     = $.let("t",     asin(r.div(R.add(r))).mul(2.0 * SPACING_FACTOR));
  const divv  = $.let("divv",  abs(div(TAU, t)).add(EP));
  const n     = $.let("n",     floor(divv));
  const pad   = $.let("pad",   fract(divv).mul(t).div(n));
  const rt    = $.let("rt",    t.div(-2.0).sub(pad.div(2.0)).add(ph));
  const rm    = $.let("rm",    mat2(cos(rt), sin(rt).neg(), sin(rt), cos(rt)));
  const zw    = $.let("zw",    rm.mul(xy.sub(C)));
  const i     = $.let("i",     floor(atan(zw.y, zw.x).div(t.add(pad))));
  const angle = $.let("angle", i.mul(t.add(pad)).add(ph));
  const cPos  = $.let("cPos",  add(vec2(cos(angle), sin(angle)).mul(R.add(r)), C));
  const hsl   = vec3(i.div(n), 1.0, 0.75);
  return vec3(circle(xy, cPos, r, 1.0, resY)).mul(hue(hsl));
});

// ── Fragment ──────────────────────────────────────────────────────────────────

export const fragment: FragmentFn = ({ $, vec2, vec4, step, length }) => {
  const CENTRAL_RADIUS   = $.const("CENTRAL_RADIUS",   0.1);
  const SATELLITE_RADIUS = $.const("SATELLITE_RADIUS", 0.0375);
  const ROTATION_SPEED   = $.const("ROTATION_SPEED",   0.15);
  const LAYER_SPACING    = $.const("LAYER_SPACING",    SPACING_FACTOR * 2.0);

  const xy             = $.let("xy",             $.fragCoord.mul(2.0).sub($.resolution).div($.resolution.y));
  const C              = $.let("C",              vec2(0.0));
  const distFromCenter = $.let("distFromCenter", length(xy.sub(C)));
  const i              = $.let("i",              $.let(distFromCenter.sub(CENTRAL_RADIUS).div(SATELLITE_RADIUS.mul(LAYER_SPACING))));
  const phaseOffset    = $.let("phaseOffset",    $.time.mul(ROTATION_SPEED).mul(i.mul(0.1).add(1.0)).neg());

  const col = $.let("col", circles(
    xy, C,
    CENTRAL_RADIUS.add(SATELLITE_RADIUS.mul(i).mul(LAYER_SPACING)),
    SATELLITE_RADIUS, phaseOffset, $.resolution.y,
  ).mul(step(0.0, i)));

  $.output(vec4(col.mul(0.9), 1.0));
};
