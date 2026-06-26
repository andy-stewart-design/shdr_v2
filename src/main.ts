import "./style.css";
import {
  createShader,
  defn,
  Float, Vec2, Mat2,
  vec2, mat2,
  sin, cos, fract, floor, sqrt, dot, mix,
} from "./shdr/index.ts";

// ── User-defined GLSL functions ───────────────────────────────────────────────
//
// Defined outside createShader — importable, composable, fully typed.
// Each compiles to a GLSL function emitted before main().

// Rotation matrix for angle `a` (radians)
const rot = defn("rot", { a: Float }, Mat2, ({ a }) =>
  mat2(cos(a), sin(a).neg(), sin(a), cos(a))
);

// Hash: vec2 → vec2, used as the building block for gradient noise
const hash = defn("hash", { p: Vec2 }, Vec2, ({ p }, $) => {
  const q = $.let("q", vec2(
    dot(p, vec2(2127.1, 81.17)),
    dot(p, vec2(1269.5, 283.37)),
  ));
  return fract(sin(q).mul(43758.5453));
});

// Gradient noise: vec2 → float in [0, 1]
// Calls hash() internally — dependency auto-discovered by the compiler.
const noise = defn("noise", { p: Vec2 }, Float, ({ p }, $) => {
  const i  = $.let("i",  floor(p));
  const f  = $.let("f",  fract(p));
  const u  = $.let("u",  f.mul(f).mul(f.mul(2.0).sub(3.0).neg()));

  const g00 = $.let("g00", hash({ p: i.add(vec2(0.0, 0.0)) }).mul(2.0).sub(1.0));
  const g10 = $.let("g10", hash({ p: i.add(vec2(1.0, 0.0)) }).mul(2.0).sub(1.0));
  const g01 = $.let("g01", hash({ p: i.add(vec2(0.0, 1.0)) }).mul(2.0).sub(1.0));
  const g11 = $.let("g11", hash({ p: i.add(vec2(1.0, 1.0)) }).mul(2.0).sub(1.0));

  const d00 = $.let("d00", dot(g00, f.sub(vec2(0.0, 0.0))));
  const d10 = $.let("d10", dot(g10, f.sub(vec2(1.0, 0.0))));
  const d01 = $.let("d01", dot(g01, f.sub(vec2(0.0, 1.0))));
  const d11 = $.let("d11", dot(g11, f.sub(vec2(1.0, 1.0))));

  return mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y).mul(0.5).add(0.5);
});

// Film grain: static per-pixel noise baked into the gradient (no u_time so it
// doesn't flicker every frame)
const filmGrain = defn("filmGrain", { uv: Vec2 }, Float, ({ uv }) =>
  sqrt(dot(hash({ p: uv }), vec2(0.5, 0.5)))
);

// ── Shader ────────────────────────────────────────────────────────────────────

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

createShader({
  canvas,
  fragment: ({ $, vec3, vec4, sin, mix, smoothstep, radians }) => {
    // ── Constants
    const COLOR_GREEN  = $.const("COLOR_GREEN",  vec3(76.0  / 255.0, 225.0 / 255.0, 96.0  / 255.0));
    const COLOR_BLUE   = $.const("COLOR_BLUE",   vec3(132.0 / 255.0, 180.0 / 255.0, 251.0 / 255.0));
    const COLOR_ORANGE = $.const("COLOR_ORANGE", vec3(255.0 / 255.0, 130.0 / 255.0, 90.0  / 255.0));
    const COLOR_YELLOW = $.const("COLOR_YELLOW", vec3(246.0 / 255.0, 224.0 / 255.0, 22.0  / 255.0));

    const ROTATION_SPEED    = $.const("ROTATION_SPEED",    0.05);
    const ROTATION_SPREAD   = $.const("ROTATION_SPREAD",   720.0);
    const ROTATION_OFFSET   = $.const("ROTATION_OFFSET",   180.0);
    const WAVE_FREQ         = $.const("WAVE_FREQ",         5.0);
    const WAVE_AMP          = $.const("WAVE_AMP",          30.0);
    const WAVE_SPEED        = $.const("WAVE_SPEED",        2.0);
    const FILM_GRAIN        = $.const("FILM_GRAIN",        0.04);

    // ── Aspect-correct UV
    const tuv  = $.let("tuv",  $.uv.sub(0.5));

    // ── Global rotation that slowly drifts using noise
    const noiseVal = $.let("noiseVal", noise({ p: vec2($.time.mul(ROTATION_SPEED), tuv.x.mul(tuv.y)) }));
    const degree   = $.let("degree",   noiseVal.sub(0.5).mul(ROTATION_SPREAD).add(ROTATION_OFFSET));
    const rotMat   = $.let("rotMat",   rot({ a: radians(degree) }));
    const tuvR     = $.let("tuvR",     rotMat.mul(tuv));

    // ── Wave distortion applied after rotation
    const speed    = $.let("speed",    $.time.mul(WAVE_SPEED));
    const distX    = $.let("distX",    sin(tuvR.y.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP));
    const distY    = $.let("distY",    sin(tuvR.x.mul(WAVE_FREQ).add(speed)).div(WAVE_AMP));

    // ── Layer blending
    const layerBlend = $.let("layerBlend", smoothstep(-0.3, 0.2, tuvR.x.add(distX)));
    const layer1     = $.let("layer1",     mix(COLOR_ORANGE, COLOR_BLUE,  layerBlend));
    const layer2     = $.let("layer2",     mix(COLOR_YELLOW, COLOR_GREEN, layerBlend));
    const color      = $.let("color",      mix(layer1, layer2, smoothstep(0.5, -0.3, tuvR.y.add(distY))));

    // ── Film grain (static — no u_time, so it's baked not flickery)
    const grain      = $.let("grain",      filmGrain({ uv: $.uv }));
    const finalColor = $.let("finalColor", color.sub(vec3(grain.mul(FILM_GRAIN))));

    $.fragColor(vec4(finalColor, 1.0));
  },
});
