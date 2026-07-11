import type {
  FloatUniformSpec,
  Texture2DUniformSpec,
  Vec2UniformSpec,
  Vec3UniformSpec,
  Vec4UniformSpec,
} from "./schema";
import type { InternalRuntimeUniforms } from "./runtime";

type FloatRuntimeUniform = InternalRuntimeUniforms<{
  value: FloatUniformSpec;
}>["value"];
type Vec2RuntimeUniform = InternalRuntimeUniforms<{
  value: Vec2UniformSpec;
}>["value"];
type Vec3RuntimeUniform = InternalRuntimeUniforms<{
  value: Vec3UniformSpec;
}>["value"];
type Vec4RuntimeUniform = InternalRuntimeUniforms<{
  value: Vec4UniformSpec;
}>["value"];
type Texture2DRuntimeUniform = InternalRuntimeUniforms<{
  value: Texture2DUniformSpec;
}>["value"];

type RuntimeUniformHandle =
  | FloatRuntimeUniform
  | Vec2RuntimeUniform
  | Vec3RuntimeUniform
  | Vec4RuntimeUniform
  | Texture2DRuntimeUniform;

function isTexture2DUniform(
  uniform: RuntimeUniformHandle,
): uniform is Texture2DRuntimeUniform {
  return uniform.schema.type === "texture2D";
}

function isFloatUniform(
  uniform: RuntimeUniformHandle,
): uniform is FloatRuntimeUniform {
  return uniform.schema.type === "float";
}

function isVec2Uniform(
  uniform: RuntimeUniformHandle,
): uniform is Vec2RuntimeUniform {
  return uniform.schema.type === "vec2";
}

function isVec3Uniform(
  uniform: RuntimeUniformHandle,
): uniform is Vec3RuntimeUniform {
  return uniform.schema.type === "vec3";
}

function isVec4Uniform(
  uniform: RuntimeUniformHandle,
): uniform is Vec4RuntimeUniform {
  return uniform.schema.type === "vec4";
}

export type WebGLUniformBinding = {
  uniform: RuntimeUniformHandle;
  location: WebGLUniformLocation | null;
  /** Bind the sampler unit — cheap, called every frame to survive program re-links. */
  bindSampler?(): void;
  apply(): void;
  destroy?(): void;
};

export function createWebGLUniformBinding(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  uniform: RuntimeUniformHandle,
  textureUnit: number,
): WebGLUniformBinding {
  const location = gl.getUniformLocation(program, `u_${name}`);

  if (isTexture2DUniform(uniform)) {
    const resolutionLocation = gl.getUniformLocation(
      program,
      `u_${name}_resolution`,
    );
    const glTexture = gl.createTexture();
    let loadId = 0;
    let destroyed = false;

    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    if (resolutionLocation) gl.uniform2f(resolutionLocation, 1, 1);

    function loadTexture(source: string | File | Blob) {
      const currentLoadId = ++loadId;
      const image = new Image();
      const objectUrl =
        source instanceof Blob ? URL.createObjectURL(source) : null;
      const url = objectUrl ?? (source as string);

      image.crossOrigin = source instanceof Blob ? "" : "anonymous";
      image.onload = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (destroyed || currentLoadId !== loadId) return;
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
        if (resolutionLocation) {
          gl.uniform2f(
            resolutionLocation,
            image.naturalWidth,
            image.naturalHeight,
          );
        }
      };
      image.onerror = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (destroyed || currentLoadId !== loadId) return;
        console.warn(`Failed to load texture uniform "${name}" from ${url}`);
        // Retry is handled automatically: texture uniforms skip equality
        // checks in set(), so calling .set(sameUrl) always triggers a reload.
      };
      image.src = url;
    }

    return {
      uniform,
      location,
      bindSampler() {
        if (location) gl.uniform1i(location, textureUnit);
      },
      apply() {
        loadTexture(uniform.get());
      },
      destroy() {
        destroyed = true;
        loadId++;
        if (glTexture) gl.deleteTexture(glTexture);
      },
    };
  }

  return {
    uniform,
    location,
    apply() {
      if (!location) return;
      if (isFloatUniform(uniform)) {
        gl.uniform1f(location, uniform.get());
      } else if (isVec2Uniform(uniform)) {
        gl.uniform2fv(location, uniform.get());
      } else if (isVec3Uniform(uniform)) {
        gl.uniform3fv(location, uniform.get());
      } else if (isVec4Uniform(uniform)) {
        gl.uniform4fv(location, uniform.get());
      }
    },
  };
}
