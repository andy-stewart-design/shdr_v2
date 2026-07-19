import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("example fragment GLSL baselines", () => {
  it("compiles circles with reusable function dependencies", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { fragment } = await import("./circles/fragment.shdr.ts");

    expect(fragment).toMatchSnapshot();
  });

  it("compiles plasma with a uniform contract", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { fragment } = await import("./plasma/fragment.shdr.ts");

    expect(fragment).toMatchSnapshot();
  });

  it("compiles pixelation with texture uniform sugar", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { fragment } = await import("./pixelation/fragment.shdr.ts");

    expect(fragment).toMatchSnapshot();
  });
});
