import type {
  FloatUniformSpec,
  RuntimeUniform,
  Texture2DUniformSpec,
  TextureFileExtension,
  Uniform,
} from "./shdr/index.ts";

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

const DEFAULT_TEXTURE_ACCEPT: TextureFileExtension[] = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
];

const MIME_BY_EXTENSION: Record<TextureFileExtension, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function textureAcceptToMime(accept: TextureFileExtension[] | undefined) {
  return (accept ?? DEFAULT_TEXTURE_ACCEPT)
    .map((extension) => MIME_BY_EXTENSION[extension])
    .join(",");
}

export function addTextureUploadControl(
  gui: GuiLike,
  label: string,
  uniform:
    | RuntimeUniform<string | File | Blob, Texture2DUniformSpec>
    | Uniform<"texture2D">,
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = textureAcceptToMime(
    "schema" in uniform ? uniform.schema.accept : undefined,
  );
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
  uniform:
    | RuntimeUniform<string | File | Blob, Texture2DUniformSpec>
    | Uniform<"texture2D">,
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
  uniform: RuntimeUniform<number, FloatUniformSpec> | Uniform<"float">,
  options: {
    min?: number;
    max?: number;
    step?: number;
    toUniform?: (value: number) => number;
    fromUniform?: (value: number) => number;
  } = {},
) {
  const schema = "schema" in uniform ? uniform.schema : undefined;
  const controlLabel = schema?.label ?? label;
  const min = options.min ?? schema?.min;
  const max = options.max ?? schema?.max;
  const step = options.step ?? schema?.step;
  const toUniform = options.toUniform ?? ((value: number) => value);
  const fromUniform = options.fromUniform ?? ((value: number) => value);
  const params = {
    [controlLabel]: fromUniform(uniform.get()),
  };

  return gui
    .add(params, controlLabel, min, max, step)
    .onChange((value: number) => {
      uniform.set(toUniform(value));
    });
}
