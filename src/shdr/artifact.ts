import type { UniformContract, UniformSchema } from "./uniforms";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Plain data emitted by the authoring compiler. This is the only value a
 * browser renderer will eventually need from authoring code.
 */
export type CompiledShaderArtifact<U extends UniformSchema = UniformSchema> = {
  target: "glsl-es-300";
  fragment: string;
  uniforms: U;
  metadata: Record<string, JsonValue>;
};

export function validateSerializableArtifact(artifact: CompiledShaderArtifact) {
  const validated = new Set<object>();

  function validate(value: unknown, path: string): void {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error(
          `Shader artifact contains non-finite number at ${path}.`,
        );
      }
      return;
    }
    if (typeof value !== "object") {
      throw new Error(
        `Shader artifact contains non-serializable ${typeof value} at ${path}.`,
      );
    }
    if (validated.has(value)) {
      throw new Error(`Shader artifact contains a cycle at ${path}.`);
    }
    validated.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => validate(item, `${path}[${index}]`));
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype) {
        throw new Error(
          `Shader artifact contains a non-plain object at ${path}.`,
        );
      }
      for (const [key, item] of Object.entries(value)) {
        validate(item, `${path}.${key}`);
      }
    }
    validated.delete(value);
  }

  validate(artifact, "artifact");
}

export type { UniformContract };
