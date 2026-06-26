// Public API
export { compileFragment }                    from "./compile.ts";
export { createShader }                       from "./runtime.ts";
export type { ShaderOptions, ShaderInstance } from "./runtime.ts";
export type { FragmentFn, Builtins }          from "./compile.ts";
export type { ExprProxy, Expr, GlslType, ShaderContext, FnDef, ShaderFn, ParamsToExprs, TupleShaderFn, TupleToExprs } from "./types.ts";

// GLSL type tokens (dual-namespace: value + type)
export { Float, Vec2, Vec3, Vec4, Mat2 } from "./glsl-types.ts";
export type { Float as FloatT, Vec2 as Vec2T, Vec3 as Vec3T, Vec4 as Vec4T, Mat2 as Mat2T } from "./glsl-types.ts";

// User-defined functions
export { defn } from "./defn.ts";

// Builtins re-exported for direct use with compileFragment
export { vec2, vec3, vec4, mat2, sin, cos, abs, fract, sqrt, floor, mix, smoothstep, radians, dot, length } from "./builtins.ts";
