export type UniformType = "float" | "vec2" | "vec3" | "vec4" | "texture2D";

export type TextureSource = string | File | Blob;
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

export type UniformSpecValue<S extends UniformSpec> = S["value"];

export type RuntimeUniform<
  TValue = UniformSpec["value"],
  TSpec extends UniformSpec = UniformSpec,
> = {
  readonly schema: TSpec;
  get(): TValue;
  set(value: TValue): void;
};

type InternalRuntimeUniform<
  TValue = UniformSpec["value"],
  TSpec extends UniformSpec = UniformSpec,
> = RuntimeUniform<TValue, TSpec> & {
  consumeDirty(): boolean;
};

export type RuntimeUniforms<U extends UniformSchema> = {
  readonly [K in keyof U]: RuntimeUniform<UniformSpecValue<U[K]>, U[K]>;
};

export type InternalRuntimeUniforms<U extends UniformSchema> = {
  readonly [K in keyof U]: InternalRuntimeUniform<UniformSpecValue<U[K]>, U[K]>;
};

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

function makeRuntimeUniformHandle<S extends UniformSpec>(
  schema: S,
): InternalRuntimeUniform<UniformSpecValue<S>, S> {
  let value = copyValue(schema.value) as UniformSpecValue<S>;
  let dirty = true;

  return {
    schema,
    get() {
      return copyValue(value) as UniformSpecValue<S>;
    },
    set(nextValue) {
      if (schema.type !== "texture2D" && equalValue(value, nextValue)) return;
      value = copyValue(nextValue) as UniformSpecValue<S>;
      dirty = true;
    },
    consumeDirty() {
      const wasDirty = dirty;
      dirty = false;
      return wasDirty;
    },
  };
}

export function createRuntimeUniforms<U extends UniformSchema>(
  uniforms: U,
): InternalRuntimeUniforms<U> {
  return Object.fromEntries(
    Object.entries(uniforms).map(([key, schema]) => [
      key,
      makeRuntimeUniformHandle(schema),
    ]),
  ) as InternalRuntimeUniforms<U>;
}

const UNIFORM_TYPES = new Set<UniformType>([
  "float",
  "vec2",
  "vec3",
  "vec4",
  "texture2D",
]);

const RESERVED_UNIFORM_KEYS = new Set([
  "time",
  "resolution",
  "mouse",
  "coord",
  "uv",
  "u",
]);

export function validateUniformMap(uniforms: UniformSchema | undefined): void {
  if (!uniforms) return;

  for (const [key, spec] of Object.entries(uniforms)) {
    if (key.startsWith("u_")) {
      throw new Error(
        `Custom uniform key "${key}" should not include the "u_" prefix. Use "${key.slice(2)}"; it will compile to "${key}".`,
      );
    }
    if (RESERVED_UNIFORM_KEYS.has(key)) {
      throw new Error(`Custom uniform key "${key}" is reserved.`);
    }

    if (!UNIFORM_TYPES.has(spec.type)) {
      throw new Error(
        `Custom uniform "${key}" has invalid type "${String(spec.type)}". Expected one of: ${[...UNIFORM_TYPES].join(", ")}.`,
      );
    }
  }
}
