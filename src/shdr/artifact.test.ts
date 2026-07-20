import { describe, expect, it } from "vitest";
import {
  validateSerializableArtifact,
  type CompiledShaderArtifact,
} from "./artifact.ts";
import { compileShader } from "./compile.ts";
import { defineUniforms } from "./uniforms";

describe("compiled shader artifacts", () => {
  it("contains GLSL and a losslessly serializable uniform contract", () => {
    const uniforms = defineUniforms((u) => ({
      gain: u.float(0.5, { min: 0, max: 1 }),
      image: u.texture2D("https://example.test/image.png"),
    }));
    const artifact = compileShader(
      ({ $, vec4 }) => {
        $.output(vec4($.u.gain, 0, 0, 1));
      },
      { uniforms },
    );

    expect(artifact.target).toBe("glsl-es-300");
    expect(artifact.fragment).toContain("uniform float u_gain;");
    expect(artifact.fragment).toContain("uniform sampler2D u_image;");
    expect(JSON.parse(JSON.stringify(artifact))).toEqual(artifact);
  });

  it("rejects non-plain data anywhere in an artifact", () => {
    const artifact = {
      target: "glsl-es-300",
      fragment: "void main() {}",
      uniforms: {},
      metadata: { invalid: new Map() },
    } as unknown as CompiledShaderArtifact;

    expect(() => validateSerializableArtifact(artifact)).toThrow(
      "non-plain object",
    );
  });
});
