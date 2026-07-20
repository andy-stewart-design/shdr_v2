export type UniformType = "float" | "vec2" | "vec3" | "vec4" | "texture2D";

/** A client-side texture value. Files and blobs never enter a shader contract. */
export type TextureSource = string | File | Blob;
export type TextureUrl = string;

/** Serializable client initialization supported by the WebGL runtime. */
export type RuntimeScale = "devicePixelRatio";
export type TextureFileExtension = "png" | "jpg" | "jpeg" | "webp" | "gif";

export type BaseUniformSpec<TType extends UniformType, TValue> = {
  type: TType;
  value: TValue;
  label?: string;
};

export type FloatUniformSpec = BaseUniformSpec<"float", number> & {
  min?: number;
  max?: number;
  step?: number;
  /** Multiplies the serializable default by a client runtime value. */
  scaleWith?: RuntimeScale;
};

export type Vec2UniformSpec = BaseUniformSpec<"vec2", [number, number]>;
export type Vec3UniformSpec = BaseUniformSpec<"vec3", [number, number, number]>;
export type Vec4UniformSpec = BaseUniformSpec<
  "vec4",
  [number, number, number, number]
>;

export type Texture2DUniformSpec = BaseUniformSpec<
  "texture2D",
  TextureUrl
> & {
  accept?: TextureFileExtension[];
};

export type UniformSpec =
  | FloatUniformSpec
  | Vec2UniformSpec
  | Vec3UniformSpec
  | Vec4UniformSpec
  | Texture2DUniformSpec;

/** Immutable, serializable shader uniform contract. */
export type UniformSchema = Record<string, UniformSpec>;
export type UniformContract = UniformSchema;

export type FloatUniformOptions = Omit<FloatUniformSpec, "type" | "value">;
export type VecUniformOptions = { label?: string };
export type TextureUniformOptions = Omit<
  Texture2DUniformSpec,
  "type" | "value"
>;

export type UniformSpecHelpers = {
  float(value: number, options?: FloatUniformOptions): FloatUniformSpec;
  vec2(value: [number, number], options?: VecUniformOptions): Vec2UniformSpec;
  vec3(
    value: [number, number, number],
    options?: VecUniformOptions,
  ): Vec3UniformSpec;
  vec4(
    value: [number, number, number, number],
    options?: VecUniformOptions,
  ): Vec4UniformSpec;
  texture2D(
    value: TextureUrl,
    options?: TextureUniformOptions,
  ): Texture2DUniformSpec;
};

const uniformSpecHelpers: UniformSpecHelpers = {
  float(value, options = {}) {
    return { type: "float", value, ...options };
  },
  vec2(value, options = {}) {
    return { type: "vec2", value, ...options };
  },
  vec3(value, options = {}) {
    return { type: "vec3", value, ...options };
  },
  vec4(value, options = {}) {
    return { type: "vec4", value, ...options };
  },
  texture2D(value, options = {}) {
    return { type: "texture2D", value, ...options };
  },
};

export function defineUniforms<U extends UniformSchema>(
  define: (u: UniformSpecHelpers) => U,
): U {
  return define(uniformSpecHelpers);
}
