// Public API
export { compileFragment }           from "./compile.ts";
export { createShader }              from "./runtime.ts";
export type { ShaderOptions, ShaderInstance } from "./runtime.ts";
export type { FragmentFn, Builtins } from "./compile.ts";
export type { ExprProxy, Expr, GlslType, ShaderContext } from "./types.ts";

// Builtins re-exported for direct use with compileFragment
export { vec2, vec3, vec4, mat2, sin, cos, abs, fract, sqrt, floor, mix, smoothstep, radians, dot, length } from "./builtins.ts";
