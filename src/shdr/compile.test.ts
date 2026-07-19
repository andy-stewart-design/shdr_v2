import { describe, expect, it } from "vitest";
import { compileFragment } from "./compile.ts";
import { fn } from "./fn.ts";
import { Float } from "./glsl-types.ts";
import { defineUniforms } from "./uniforms";

describe("compileFragment baseline", () => {
  it("emits uniforms, named declarations, and function dependencies", () => {
    const uniforms = defineUniforms((u) => ({
      gain: u.float(0.5, { min: 0, max: 1 }),
      image: u.texture2D("https://example.test/image.png"),
    }));
    const twice = fn("twice", [Float], Float, ([value]) => value.mul(2));

    const glsl = compileFragment(
      ({ $, float, vec4 }) => {
        const BASE = $.const("BASE", float(0.25));
        const amplified = $.let("amplified", twice($.u.gain).add(BASE));
        const sampled = $.let("sampled", $.u.image.sample($.uv));
        $.output(vec4(sampled.rgb.mul(amplified), 1));
      },
      { uniforms },
    );

    expect(glsl).toContain("uniform float u_gain;");
    expect(glsl).toContain("uniform sampler2D u_image;");
    expect(glsl).toContain("uniform vec2 u_image_resolution;");
    expect(glsl).toContain("const float BASE = float(0.25);");
    expect(glsl).toContain("float twice(float _p0) {");
    expect(glsl).toContain("return (_p0 * 2.0);");
    expect(glsl).toContain("float amplified = (twice(u_gain) + BASE);");
    expect(glsl).toContain("vec4 sampled = texture(u_image, shdr_uv);");
    expect(glsl).toContain("fragColor = vec4((sampled.rgb * amplified), 1.0);");
  });

  it("emits dependent functions before their callers", () => {
    const square = fn("square", [Float], Float, ([value]) => value.mul(value));
    const fourthPower = fn("fourthPower", [Float], Float, ([value]) =>
      square(square(value)),
    );

    const glsl = compileFragment(({ $, vec3, vec4 }) => {
      $.output(vec4(vec3(fourthPower($.time)), 1));
    });

    expect(glsl.indexOf("float square(")).toBeLessThan(
      glsl.indexOf("float fourthPower("),
    );
  });
});
