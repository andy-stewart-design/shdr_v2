import type { UniformSchema, UniformType } from "./schema.ts";

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

export function validateUniformSchema(
  uniforms: UniformSchema | undefined,
): void {
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
    if (spec.type === "texture2D" && typeof spec.value !== "string") {
      throw new Error(
        `Texture uniform "${key}" must use a serializable URL string default. Set File or Blob values on the client runtime handle.`,
      );
    }
    if (
      spec.type === "float" &&
      spec.scaleWith !== undefined &&
      spec.scaleWith !== "devicePixelRatio"
    ) {
      throw new Error(
        `Float uniform "${key}" has unsupported runtime scale "${String(spec.scaleWith)}".`,
      );
    }
  }
}
