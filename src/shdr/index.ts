// Public API
export { compileFragment, compileShader, compileFn } from "./compile";
export type { CompiledShaderArtifact } from "./artifact";
export { defineUniforms } from "./uniforms";
export type {
  TextureSource,
  TextureUrl,
  TextureFileExtension,
  RuntimeScale,
  BaseUniformSpec,
  FloatUniformSpec,
  Vec2UniformSpec,
  Vec3UniformSpec,
  Vec4UniformSpec,
  Texture2DUniformSpec,
  UniformSpec,
  UniformSchema,
  UniformContract,
  FloatUniformOptions,
  VecUniformOptions,
  TextureUniformOptions,
  UniformSpecHelpers,
  RuntimeUniform,
  RuntimeUniforms,
  RuntimeTextureUniform,
  RuntimeEnvironment,
  TextureStatus,
} from "./uniforms";
export type { FragmentFn } from "./context/fragment";
export type { Builtins } from "./context/builtins";
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
} from "./types";

// GLSL type tokens (dual-namespace: value + type)
export { Float, Vec2, Vec3, Vec4, Mat2 } from "./glsl-types";
export type {
  Float as FloatT,
  Vec2 as Vec2T,
  Vec3 as Vec3T,
  Vec4 as Vec4T,
  Mat2 as Mat2T,
} from "./glsl-types";

// User-defined functions
export { fn } from "./fn";
export type { FnContext } from "./context/fn";

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
