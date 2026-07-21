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

export type TextureStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; width: number; height: number }
  | { state: "error"; error: Error };

export type RuntimeTextureUniform<
  TSpec extends Texture2DUniformSpec = Texture2DUniformSpec,
> = RuntimeUniform<TextureSource, TSpec> & {
  readonly status: TextureStatus;
  onStatusChange(listener: (status: TextureStatus) => void): () => void;
};

type InternalRuntimeUniform<
  TValue = UniformSpec["value"],
  TSpec extends UniformSpec = UniformSpec,
> = RuntimeUniform<TValue, TSpec> & {
  consumeDirty(): boolean;
};

type TextureStatusControls = {
  readonly status: TextureStatus;
  onStatusChange(listener: (status: TextureStatus) => void): () => void;
  setStatus(status: TextureStatus): void;
};

export type InternalRuntimeTextureUniform<
  TSpec extends Texture2DUniformSpec = Texture2DUniformSpec,
> = RuntimeTextureUniform<TSpec> & {
  consumeDirty(): boolean;
  setStatus(status: TextureStatus): void;
};

type RuntimeUniformFor<S extends UniformSpec> = S extends Texture2DUniformSpec
  ? RuntimeTextureUniform<S>
  : RuntimeUniform<UniformSpecValue<S>, S>;

type InternalRuntimeUniformFor<S extends UniformSpec> =
  S extends Texture2DUniformSpec
    ? InternalRuntimeTextureUniform<S>
    : InternalRuntimeUniform<UniformSpecValue<S>, S>;

export type RuntimeUniforms<U extends UniformSchema> = {
  readonly [K in keyof U]: RuntimeUniformFor<U[K]>;
};

export type InternalRuntimeUniforms<U extends UniformSchema> = {
  readonly [K in keyof U]: InternalRuntimeUniformFor<U[K]>;
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
): InternalRuntimeUniform<RuntimeUniformValue, UniformSpec> &
  TextureStatusControls {
  let value: RuntimeUniformValue = copyValue(initialValue(schema, environment));
  let dirty = true;
  let status: TextureStatus = { state: "idle" };
  const statusListeners = new Set<(next: TextureStatus) => void>();

  function setStatus(next: TextureStatus) {
    status = next;
    for (const listener of statusListeners) listener(status);
  }

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
    get status() {
      return status;
    },
    onStatusChange(listener: (next: TextureStatus) => void) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    setStatus,
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
