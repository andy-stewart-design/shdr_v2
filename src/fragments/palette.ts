import { fn, Float, Vec2, Vec3, vec2, vec3, sin, cos, fract, dot, mix } from "../shdr/index.ts";
import type { FragmentFn } from "../shdr/index.ts";

// ── Helper functions ──────────────────────────────────────────────────────────

// Inigo Quilez cosine palette — https://iquilezles.org/articles/palettes/
const palette = fn("palette", [Float], Vec3, ([t]) => {
  const a = vec3(0.1);
  const b = vec3(0.8);
  const c = vec3(0.4);
  const d = vec3(0.0, 0.1, 0.2);
  return a.add(b.mul(cos(c.mul(t).add(d).mul(6.28318))));
});

// Simple hash — vec2 → float in [0, 1]
const rand = fn("rand", [Vec2], Float, ([n]) =>
  fract(sin(dot(n, vec2(12.9898, 4.1414))).mul(43758.5453))
);

// ── Fragment ──────────────────────────────────────────────────────────────────

export const fragment: FragmentFn = ({ $, vec3, vec4, sin }) => {
  // ── Coordinate remapping
  // $.uv is [0,1]², remap to [-1,1] then scale down
  const ndc  = $.let("ndc",  $.uv.mul(2.0).sub(1.0));
  const uv1  = $.let("uv1", ndc.mul(0.06));
  const uv2  = $.let("uv2", uv1.sub(0.03));

  // ── Static grain baked from the pre-distortion UV
  const grain = $.let("grain", rand(uv2.mul(100.0)));

  // ── Wave distortion — the original has a for loop (n=1..2) that runs once.
  // The loop variable `i` is never used in the body, so we just inline the
  // single iteration directly as an SSA step.
  const waveX = $.let("waveX", sin(uv2.x.mul(6.0).add(sin($.time.add(uv2.y.mul(6.0))).mul(0.2))));
  const waveY = $.let("waveY", sin(uv2.y.mul(6.0).add(sin($.time.add(uv2.x.mul(6.0))).mul(0.2))));
  const uv3   = $.let("uv3",   uv2.add(vec2(waveX, waveY)));

  // ── Color — two palette samples, one with grain offset
  const palInput     = $.let("palInput",     uv3.x.mul(sin(1.0)).add(uv3.y));
  const color        = $.let("color",        palette(palInput));
  const colorGrained = $.let("colorGrained", palette(palInput.add(grain)));

  // Blend grained and clean, then fade from black — SSA replaces color =
  const blended    = $.let("blended",   mix(colorGrained, color, 0.925));
  const finalColor = $.let("finalColor", mix(vec3(0.0), blended, 0.9));

  $.output(vec4(finalColor, 1.0));
};
