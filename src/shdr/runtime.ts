import type { CompiledShaderArtifact } from "./artifact";
import { createRuntimeUniforms, createWebGLUniformBinding } from "./uniforms";
import type { RuntimeUniforms, UniformSchema } from "./uniforms";
import { observeCanvas } from "./webgl/canvas";
import { createWebGLProgram } from "./webgl/program";

export interface ShaderOptions<U extends UniformSchema = UniformSchema> {
  canvas: HTMLCanvasElement;
  shader: CompiledShaderArtifact<U>;
}

export interface ShaderInstance<U extends UniformSchema = UniformSchema> {
  readonly u: RuntimeUniforms<U>;
  destroy(): void;
}

/** Render a previously compiled WebGL shader artifact. */
export function createShader<U extends UniformSchema = UniformSchema>(
  options: ShaderOptions<U>,
): ShaderInstance<U> {
  const { canvas, shader } = options;
  if (shader.target !== "glsl-es-300") {
    throw new Error(`WebGL cannot render shader target "${shader.target}".`);
  }

  const context = canvas.getContext("webgl2");
  if (!context) throw new Error("WebGL 2 not supported — try a different browser");
  const gl: WebGL2RenderingContext = context;

  const resources = createWebGLProgram(gl, shader.fragment);
  gl.useProgram(resources.program);

  const uTime = gl.getUniformLocation(resources.program, "u_time");
  const uResolution = gl.getUniformLocation(resources.program, "u_resolution");
  const uMouse = gl.getUniformLocation(resources.program, "u_mouse");
  const liveUniforms = createRuntimeUniforms(shader.uniforms, {
    devicePixelRatio,
  });
  let nextTextureUnit = 0;
  const bindings = Object.entries(liveUniforms).map(([name, uniform]) =>
    createWebGLUniformBinding(
      gl,
      resources.program,
      name,
      uniform,
      uniform.schema.type === "texture2D" ? nextTextureUnit++ : 0,
    ),
  );

  const signals = observeCanvas(canvas);
  signals.applySize();
  let destroyed = false;
  let rafId = 0;

  function render(now: number) {
    if (destroyed) return;
    signals.applySize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uTime, now / 1000);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform2f(uMouse, signals.mouseX, signals.mouseY);
    for (const binding of bindings) {
      binding.bindSampler?.();
      if (binding.uniform.consumeDirty()) binding.apply();
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rafId = requestAnimationFrame(render);
  }

  rafId = requestAnimationFrame(render);
  return {
    u: liveUniforms,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(rafId);
      signals.destroy();
      for (const binding of bindings) binding.destroy?.();
      resources.destroy();
    },
  };
}
