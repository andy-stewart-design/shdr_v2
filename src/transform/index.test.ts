import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { transformShdrSource } from "./index.ts";

const fixture = `import { fn, Float, FragmentFn } from "@shdr/index";

const helper = fn([Float], Float, ([value], { sin }) => {
  const wave = sin(value);
  const SCALE = 2.0;
  return wave.mul(SCALE);
});

export const fragment: FragmentFn = ({ vec3, vec4 }) => {
  const uv = $.uv.sub(0.5);
  const COLOR = vec3(0.2, 0.4, 1.0);
  const _inline = uv.mul(2.0);
  const named = $.let(vec3(_inline.x, COLOR.y, 1.0));
  $.output(vec4(named, 1.0));
};
`;

describe("transformShdrSource baseline", () => {
  it("preserves the implicit naming conventions", () => {
    const result = transformShdrSource(fixture, "/fixture.shdr.ts");

    expect(result?.code).toMatchSnapshot();
  });

  it.each([
    "../fragments/circles/fragment.shdr.ts",
    "../fragments/plasma/fragment.shdr.ts",
    "../fragments/pixelation/fragment.shdr.ts",
  ])("snapshots the transformed %s source", async (fragmentPath) => {
    const source = await readFile(new URL(fragmentPath, import.meta.url), "utf8");
    const result = transformShdrSource(source, fragmentPath);

    expect(result?.code).toMatchSnapshot();
  });
});
