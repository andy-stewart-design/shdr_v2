import type { GlslType } from "./types.ts";

export type UniformKind = "float" | "vec2" | "vec3" | "vec4" | "texture2D";

export type TextureSource = string | File | Blob;
export type TextureFileExtension = "png" | "jpg" | "jpeg" | "webp" | "gif";

export type BaseUniformSpec<TType extends string, TValue> = {
  type: TType;
  value: TValue;
  label?: string;
};

export type FloatUniformSpec = BaseUniformSpec<"float", number> & {
  min?: number;
  max?: number;
  step?: number;
};

export type Vec2UniformSpec = BaseUniformSpec<"vec2", [number, number]>;
export type Vec3UniformSpec = BaseUniformSpec<"vec3", [number, number, number]>;
export type Vec4UniformSpec = BaseUniformSpec<
  "vec4",
  [number, number, number, number]
>;

export type Texture2DUniformSpec = BaseUniformSpec<
  "texture2D",
  TextureSource
> & {
  accept?: TextureFileExtension[];
};

export type UniformSpec =
  | FloatUniformSpec
  | Vec2UniformSpec
  | Vec3UniformSpec
  | Vec4UniformSpec
  | Texture2DUniformSpec;

export type UniformSchema = Record<string, UniformSpec>;

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
    value: TextureSource,
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

export type UniformValue<K extends UniformKind = UniformKind> =
  K extends "float"
    ? number
    : K extends "vec2"
      ? [number, number]
      : K extends "vec3"
        ? [number, number, number]
        : K extends "vec4"
          ? [number, number, number, number]
          : TextureSource;

export type Uniform<K extends UniformKind = UniformKind> = {
  readonly kind: K;
  get(): UniformValue<K>;
  set(value: UniformValue<K>): void;
  consumeDirty(): boolean;
};

export type UniformMap = Record<string, Uniform>;

function equalValue(
  a: number | TextureSource | readonly number[],
  b: number | TextureSource | readonly number[],
) {
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function copyValue<T extends number | TextureSource | readonly number[]>(
  value: T,
): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

function makeUniform<K extends UniformKind>(
  kind: K,
  initialValue: UniformValue<K>,
): Uniform<K> {
  let value = copyValue(initialValue);
  let dirty = true;

  return {
    kind,
    get() {
      return copyValue(value);
    },
    set(nextValue) {
      // Texture uniforms skip equality checking — the async load cost makes
      // the optimisation pointless, and it means .set(sameUrl) always works
      // as a retry after a failed load without any special error handling.
      if (kind !== "texture2D" && equalValue(value, nextValue)) return;
      value = copyValue(nextValue);
      dirty = true;
    },
    consumeDirty() {
      const wasDirty = dirty;
      dirty = false;
      return wasDirty;
    },
  };
}

export const uniform = {
  float(value: number): Uniform<"float"> {
    return makeUniform("float", value);
  },
  vec2(value: [number, number]): Uniform<"vec2"> {
    return makeUniform("vec2", value);
  },
  vec3(value: [number, number, number]): Uniform<"vec3"> {
    return makeUniform("vec3", value);
  },
  vec4(value: [number, number, number, number]): Uniform<"vec4"> {
    return makeUniform("vec4", value);
  },
  texture2D(source: TextureSource): Uniform<"texture2D"> {
    return makeUniform("texture2D", source);
  },
};

export function uniformKindToGlslType(kind: UniformKind): GlslType {
  return kind === "texture2D" ? "sampler2D" : kind;
}

const RESERVED_UNIFORM_KEYS = new Set([
  "time",
  "resolution",
  "mouse",
  "coord",
  "uv",
  "u",
]);

export function validateUniformMap(uniforms: UniformMap | undefined): void {
  if (!uniforms) return;

  for (const key of Object.keys(uniforms)) {
    if (key.startsWith("u_")) {
      throw new Error(
        `Custom uniform key "${key}" should not include the "u_" prefix. Use "${key.slice(2)}"; it will compile to "${key}".`,
      );
    }
    if (RESERVED_UNIFORM_KEYS.has(key)) {
      throw new Error(`Custom uniform key "${key}" is reserved.`);
    }
  }
}
