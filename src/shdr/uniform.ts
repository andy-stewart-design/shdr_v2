import type { GlslType } from "./types.ts";

export type UniformKind = "float" | "vec2" | "vec3" | "vec4";

export type UniformValue<K extends UniformKind = UniformKind> =
  K extends "float"
    ? number
    : K extends "vec2"
      ? [number, number]
      : K extends "vec3"
        ? [number, number, number]
        : [number, number, number, number];

export type Uniform<K extends UniformKind = UniformKind> = {
  readonly kind: K;
  get(): UniformValue<K>;
  set(value: UniformValue<K>): void;
  consumeDirty(): boolean;
};

export type UniformMap = Record<string, Uniform>;

function equalValue(a: number | readonly number[], b: number | readonly number[]) {
  if (typeof a === "number" || typeof b === "number") return a === b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function copyValue<T extends number | readonly number[]>(value: T): T {
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
      if (equalValue(value, nextValue)) return;
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
};

export function uniformKindToGlslType(kind: UniformKind): GlslType {
  return kind;
}

const RESERVED_UNIFORM_KEYS = new Set([
  "time",
  "resolution",
  "mouse",
  "fragCoord",
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
