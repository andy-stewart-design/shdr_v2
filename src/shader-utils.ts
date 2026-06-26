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
//
// All use the array form of defn so they can be called positionally:
//   rot(angle)  instead of  rot({ a: angle })
//   hash(p)     instead of  hash({ p })
// etc.

export const rot = defn("rot", [Float], Mat2, ([a], $) => {
  const s = $.let(sin(a));
  const c = $.let(cos(a));
  return mat2(c, s.neg(), s, c);
});

export const hash = defn("hash", [Vec2], Vec2, ([p], $) => {
  const q = $.let(
    vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37))),
  );
  return fract(sin(q).mul(43758.5453));
});

export const noise = defn("noise", [Vec2], Float, ([p], $) => {
  const i = $.let(floor(p));
  const f = $.let(fract(p));
  const u = $.let(f.mul(f).mul(f.mul(2.0).sub(3.0).neg()));

  const g00 = $.let(
    hash(i.add(vec2(0.0, 0.0)))
      .mul(2.0)
      .sub(1.0),
  );
  const g10 = $.let(
    hash(i.add(vec2(1.0, 0.0)))
      .mul(2.0)
      .sub(1.0),
  );
  const g01 = $.let(
    hash(i.add(vec2(0.0, 1.0)))
      .mul(2.0)
      .sub(1.0),
  );
  const g11 = $.let(
    hash(i.add(vec2(1.0, 1.0)))
      .mul(2.0)
      .sub(1.0),
  );

  const d00 = $.let(dot(g00, f.sub(vec2(0.0, 0.0))));
  const d10 = $.let(dot(g10, f.sub(vec2(1.0, 0.0))));
  const d01 = $.let(dot(g01, f.sub(vec2(0.0, 1.0))));
  const d11 = $.let(dot(g11, f.sub(vec2(1.0, 1.0))));

  return mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y)
    .mul(0.5)
    .add(0.5);
});

// Intentionally has no u_time dependency — produces a static grain texture
// baked into the gradient rather than flickering on every frame.
export const filmGrain = defn("filmGrain", [Vec2], Float, ([uv]) =>
  length(hash(uv)),
);
