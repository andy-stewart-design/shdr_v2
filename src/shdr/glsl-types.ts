import type { ExprProxy } from "./types.ts";

// ---------------------------------------------------------------------------
// Dual-namespace GLSL type tokens
//
// Each name works in both positions:
//   value position → the GlslType string the runtime needs  e.g. "float"
//   type position  → the ExprProxy alias TypeScript uses    e.g. ExprProxy<"float">
//
// Usage:
//   const rot = defn("rot", { a: Float }, Mat2, ({ a }) => { ... });
//                            ↑ value          ↑ value
//   interface RotArgs { a: Float }
//                          ↑ type → ExprProxy<"float">
// ---------------------------------------------------------------------------

export const Float = "float" as const;  export type Float = ExprProxy<"float">;
export const Vec2  = "vec2"  as const;  export type Vec2  = ExprProxy<"vec2">;
export const Vec3  = "vec3"  as const;  export type Vec3  = ExprProxy<"vec3">;
export const Vec4  = "vec4"  as const;  export type Vec4  = ExprProxy<"vec4">;
export const Mat2  = "mat2"  as const;  export type Mat2  = ExprProxy<"mat2">;
