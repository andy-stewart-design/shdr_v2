import type {
  FloatUniformSpec,
  RuntimeUniform,
  Texture2DUniformSpec,
  TextureFileExtension,
  UniformSchema,
} from "./shdr/index.ts";
import type { ShaderInstance } from "./shdr/webgl.ts";

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
  uniform: RuntimeUniform<string | File | Blob, Texture2DUniformSpec>,
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = textureAcceptToMime(uniform.schema.accept);
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
  uniform: RuntimeUniform<string | File | Blob, Texture2DUniformSpec>,
) {
  const params = {
    [label]: uniform.get(),
  };

  return gui.add(params, label).onChange((value: string) => {
    uniform.set(value);
  });
}

export function addUniformControls<U extends UniformSchema>(
  gui: GuiLike,
  shader: ShaderInstance<U>,
) {
  for (const [key, uniform] of Object.entries(shader.u)) {
    switch (uniform.schema.type) {
      case "float":
        addFloatUniformControl(
          gui,
          uniform.schema.label ?? key,
          uniform as RuntimeUniform<number, FloatUniformSpec>,
        );
        break;
      case "texture2D":
        addStringUniformControl(
          gui,
          uniform.schema.label ?? key,
          uniform as RuntimeUniform<string | File | Blob, Texture2DUniformSpec>,
        );
        addTextureUploadControl(
          gui,
          `Upload ${uniform.schema.label ?? key}`,
          uniform as RuntimeUniform<string | File | Blob, Texture2DUniformSpec>,
        );
        break;
    }
  }
}

export function addFloatUniformControl(
  gui: GuiLike,
  label: string,
  uniform: RuntimeUniform<number, FloatUniformSpec>,
  options: {
    min?: number;
    max?: number;
    step?: number;
  } = {},
) {
  const controlLabel = uniform.schema.label ?? label;
  const min = options.min ?? uniform.schema.min;
  const max = options.max ?? uniform.schema.max;
  const step = options.step ?? uniform.schema.step;
  const params = {
    [controlLabel]: uniform.get(),
  };

  return gui
    .add(params, controlLabel, min, max, step)
    .onChange((value: number) => {
      uniform.set(value);
    });
}
