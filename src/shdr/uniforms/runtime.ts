import type {
  Texture2DUniformSpec,
  TextureSource,
  UniformSchema,
  UniformSpec,
} from "./schema";

export type UniformSpecValue<S extends UniformSpec> =
  S extends Texture2DUniformSpec ? TextureSource : S["value"];

type RuntimeUniformValue = UniformSpecValue<UniformSpec>;

export type RuntimeEnvironment = {
  devicePixelRatio?: number;
};

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

function resolveFloatInitialValue(
  schema: Extract<UniformSpec, { type: "float" }>,
  environment: RuntimeEnvironment,
) {
  return schema.scaleWith === "devicePixelRatio"
    ? schema.value * (environment.devicePixelRatio ?? 1)
    : schema.value;
}

function initialValue(schema: UniformSpec, environment: RuntimeEnvironment) {
  return schema.type === "float"
    ? resolveFloatInitialValue(schema, environment)
    : schema.value;
}

function makeRuntimeUniformHandle(
  schema: UniformSpec,
  environment: RuntimeEnvironment,
): InternalRuntimeUniform<RuntimeUniformValue, UniformSpec> {
  let value: RuntimeUniformValue = copyValue(initialValue(schema, environment));
  let dirty = true;

  return {
    schema,
    get() {
      return copyValue(value);
    },
    set(nextValue) {
      if (schema.type !== "texture2D" && equalValue(value, nextValue)) return;
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

export function createRuntimeUniforms<U extends UniformSchema>(
  uniforms: U,
  environment: RuntimeEnvironment = {},
): InternalRuntimeUniforms<U> {
  return Object.fromEntries(
    Object.entries(uniforms).map(([key, schema]) => [
      key,
      makeRuntimeUniformHandle(schema, environment),
    ]),
  ) as InternalRuntimeUniforms<U>;
}
