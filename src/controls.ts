import type { Uniform } from "./shdr/index.ts";

type GuiLike = {
  add(
    object: Record<string, unknown>,
    property: string,
    min?: number,
    max?: number,
    step?: number,
  ): {
    name?(label: string): unknown;
    onChange(fn: (value: number) => void): unknown;
  };
};

export function addFloatUniformControl(
  gui: GuiLike,
  label: string,
  uniform: Uniform<"float">,
  options: { min?: number; max?: number; step?: number } = {},
) {
  const params = {
    [label]: uniform.get(),
  };

  return gui
    .add(params, label, options.min, options.max, options.step)
    .onChange((value: number) => {
      uniform.set(value);
    });
}
