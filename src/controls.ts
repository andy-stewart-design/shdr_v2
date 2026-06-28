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
  options: {
    min?: number;
    max?: number;
    step?: number;
    /** Convert the GUI value before writing it to the shader uniform. */
    toUniform?: (value: number) => number;
    /** Convert the current shader uniform value into the displayed GUI value. */
    fromUniform?: (value: number) => number;
  } = {},
) {
  const toUniform = options.toUniform ?? ((value: number) => value);
  const fromUniform = options.fromUniform ?? ((value: number) => value);

  const params = {
    [label]: fromUniform(uniform.get()),
  };

  return gui
    .add(params, label, options.min, options.max, options.step)
    .onChange((value: number) => {
      uniform.set(toUniform(value));
    });
}
