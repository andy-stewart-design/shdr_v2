// Public API
export { compileFragment, compileFn } from "./compile.ts";
export { createShader } from "./runtime.ts";
export type { ShaderOptions, ShaderInstance } from "./runtime.ts";
export { defineUniforms } from "./uniforms";
export type {
  TextureSource,
  TextureFileExtension,
  BaseUniformSpec,
  FloatUniformSpec,
  Vec2UniformSpec,
  Vec3UniformSpec,
  Vec4UniformSpec,
  Texture2DUniformSpec,
  UniformSpec,
  UniformSchema,
  FloatUniformOptions,
  VecUniformOptions,
  TextureUniformOptions,
  UniformSpecHelpers,
  RuntimeUniform,
  RuntimeUniforms,
} from "./uniforms";
export type { FragmentFn } from "./compile.ts";
export type { Builtins } from "./context";
export type {
  ExprProxy,
  TextureUniformExpr,
  Expr,
  GlslType,
  ShaderContext,
  FnDef,
  ShaderFn,
  ParamsToExprs,
  TupleShaderFn,
  TupleToExprs,
} from "./types.ts";

// GLSL type tokens (dual-namespace: value + type)
export { Float, Vec2, Vec3, Vec4, Mat2 } from "./glsl-types.ts";
export type {
  Float as FloatT,
  Vec2 as Vec2T,
  Vec3 as Vec3T,
  Vec4 as Vec4T,
  Mat2 as Mat2T,
} from "./glsl-types.ts";

// User-defined functions
export { fn } from "./fn.ts";
export type { FnContext } from "./fn.ts";

// Builtins re-exported for direct use with compileFragment
export {
  float,
  vec2,
  vec3,
  vec4,
  mat2,
  // trig
  sin,
  cos,
  asin,
  acos,
  atan,
  // math
  abs,
  sqrt,
  floor,
  ceil,
  sign,
  fract,
  mod,
  pow,
  exp,
  exp2,
  log,
  log2,
  // interpolation
  mix,
  smoothstep,
  step,
  clamp,
  // texture
  texture,
  // geometry
  dot,
  length,
  normalize,
  cross,
  reflect,
  // unit conversion
  radians,
  // vector ops (also usable as free functions)
  min,
  max,
  // arithmetic operators as free functions
  add,
  sub,
  mul,
  div,
  neg,
} from "./builtins";
