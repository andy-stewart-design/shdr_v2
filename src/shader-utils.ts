import {
  defn,
  vec2,
  mat2,
  sin,
  cos,
  fract,
  floor,
  dot,
  mix,
  length,
  Float,
  Vec2,
  Mat2,
} from "./shdr/index.ts";

// ── Helper functions ──────────────────────────────────────────────────────────

export const rot = defn("rot", { a: Float }, Mat2, ({ a }, $) => {
  const s = $.let("s", sin(a));
  const c = $.let("c", cos(a));
  return mat2(c, s.neg(), s, c);
});

export const hash = defn("hash", { p: Vec2 }, Vec2, ({ p }, $) => {
  const q = $.let(
    "q",
    vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37))),
  );
  return fract(sin(q).mul(43758.5453));
});

export const noise = defn("noise", { p: Vec2 }, Float, ({ p }, $) => {
  const i = $.let("i", floor(p));
  const f = $.let("f", fract(p));
  const u = $.let("u", f.mul(f).mul(f.mul(2.0).sub(3.0).neg()));

  const g00 = $.let(
    "g00",
    hash({ p: i.add(vec2(0.0, 0.0)) })
      .mul(2.0)
      .sub(1.0),
  );
  const g10 = $.let(
    "g10",
    hash({ p: i.add(vec2(1.0, 0.0)) })
      .mul(2.0)
      .sub(1.0),
  );
  const g01 = $.let(
    "g01",
    hash({ p: i.add(vec2(0.0, 1.0)) })
      .mul(2.0)
      .sub(1.0),
  );
  const g11 = $.let(
    "g11",
    hash({ p: i.add(vec2(1.0, 1.0)) })
      .mul(2.0)
      .sub(1.0),
  );

  const d00 = $.let("d00", dot(g00, f.sub(vec2(0.0, 0.0))));
  const d10 = $.let("d10", dot(g10, f.sub(vec2(1.0, 0.0))));
  const d01 = $.let("d01", dot(g01, f.sub(vec2(0.0, 1.0))));
  const d11 = $.let("d11", dot(g11, f.sub(vec2(1.0, 1.0))));

  return mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y)
    .mul(0.5)
    .add(0.5);
});

// Intentionally has no u_time dependency — produces a static grain texture
// baked into the gradient rather than flickering on every frame.
export const filmGrainNoise = defn(
  "filmGrainNoise",
  { uv: Vec2 },
  Float,
  ({ uv }) => length(hash({ p: uv })),
);
