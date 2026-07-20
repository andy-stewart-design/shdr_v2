import { describe, expect, it } from "vitest";
import {
  createRuntimeUniforms,
  defineUniforms,
  validateUniformSchema,
} from "./uniforms";

describe("uniform baseline", () => {
  it("copies vector values and tracks dirty state for schema uniforms", () => {
    const schema = defineUniforms((u) => ({
      color: u.vec3([0.1, 0.2, 0.3]),
    }));
    const color = createRuntimeUniforms(schema).color;

    expect(color.consumeDirty()).toBe(true);
    expect(color.consumeDirty()).toBe(false);

    const read = color.get();
    read[0] = 9;
    expect(color.get()).toEqual([0.1, 0.2, 0.3]);

    color.set([0.1, 0.2, 0.3]);
    expect(color.consumeDirty()).toBe(false);
    color.set([0.3, 0.2, 0.1]);
    expect(color.consumeDirty()).toBe(true);
  });

  it("keeps uniform contracts JSON-serializable", () => {
    const schema = defineUniforms((u) => ({
      texture: u.texture2D("https://example.test/image.png", {
        accept: ["png"],
      }),
      pixelation: u.float(40, { scaleWith: "devicePixelRatio" }),
    }));

    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it("resolves declarative device-pixel-ratio scaling in the runtime", () => {
    const schema = defineUniforms((u) => ({
      pixelation: u.float(40, { scaleWith: "devicePixelRatio" }),
    }));

    const pixelation = createRuntimeUniforms(schema, {
      devicePixelRatio: 2,
    }).pixelation;
    expect(pixelation.get()).toBe(80);
    expect(schema.pixelation.value).toBe(40);
  });

  it("rejects reserved uniform names", () => {
    expect(() =>
      validateUniformSchema({
        time: { type: "float", value: 1 },
      }),
    ).toThrow('Custom uniform key "time" is reserved.');
  });

  it("rejects browser-only texture defaults from contracts", () => {
    expect(() =>
      validateUniformSchema({
        texture: {
          type: "texture2D",
          value: new Blob(),
        } as unknown as { type: "texture2D"; value: string },
      }),
    ).toThrow("must use a serializable URL string default");
  });

  it("marks a texture dirty even when reset to the same URL", () => {
    const schema = defineUniforms((u) => ({
      texture: u.texture2D("https://example.test/image.png"),
    }));
    const texture = createRuntimeUniforms(schema).texture;

    expect(texture.consumeDirty()).toBe(true);
    texture.set("https://example.test/image.png");
    expect(texture.consumeDirty()).toBe(true);
  });
});
