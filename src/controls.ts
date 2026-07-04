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
    onChange(fn: (value: any) => void): unknown;
  };
};

export function addTextureUploadControl(
  gui: GuiLike,
  label: string,
  uniform: Uniform<"texture2D">,
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif";
  input.style.display = "none";
  document.body.appendChild(input);

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    uniform.set(file);
    input.value = "";
  });

  const property = label.replace(/\W+/g, "_") || "uploadTexture";
  const params = {
    [property]() {
      input.click();
    },
  };

  return gui.add(params, property).name?.(label);
}

export function addStringUniformControl(
  gui: GuiLike,
  label: string,
  uniform: Uniform<"texture2D">,
) {
  const params = {
    [label]: uniform.get(),
  };

  return gui.add(params, label).onChange((value: string) => {
    uniform.set(value);
  });
}

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
