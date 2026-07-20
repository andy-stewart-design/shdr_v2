import { compileFragment } from "./compile";
import type { FragmentFn } from "./context/fragment";
import {
  createRuntimeUniforms,
  validateUniformSchema,
  createWebGLUniformBinding,
  type RuntimeUniforms,
  type UniformSchema,
} from "./uniforms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShaderOptions<U extends UniformSchema = UniformSchema> {
  canvas: HTMLCanvasElement;
  fragment: string | FragmentFn<U>;
  uniforms?: U;
}

export interface ShaderInstance<U extends UniformSchema = UniformSchema> {
  /** Live runtime uniform handles. */
  readonly u: RuntimeUniforms<U>;
  /** Stop the render loop and free all WebGL resources. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Vertex shader — GLSL ES 3.00, uses gl_VertexID so no buffer needed.
// Draws one oversized triangle that covers the entire clip space.
// ---------------------------------------------------------------------------

const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}`.trim();

// ---------------------------------------------------------------------------
// WebGL 2 helpers
// ---------------------------------------------------------------------------

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown error";
    gl.deleteProgram(program);
    throw new Error(`Shader link error:\n${log}`);
  }
  return program;
}

// ---------------------------------------------------------------------------
// createShader — compile + run
// ---------------------------------------------------------------------------

export function createShader<U extends UniformSchema = UniformSchema>(
  options: ShaderOptions<U>,
): ShaderInstance<U> {
  const { canvas } = options;
  validateUniformSchema(options.uniforms);

  const glsl =
    typeof options.fragment === "string"
      ? options.fragment
      : compileFragment(options.fragment, { uniforms: options.uniforms });

  // --- WebGL 2 setup ---
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL 2 not supported — try a different browser");

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, glsl);
  const program = linkProgram(gl, vert, frag);

  // No vertex buffer needed — gl_VertexID drives the oversized triangle
  const uTime = gl.getUniformLocation(program, "u_time");
  const uResolution = gl.getUniformLocation(program, "u_resolution");
  const uMouse = gl.getUniformLocation(program, "u_mouse");

  gl.useProgram(program);

  let nextTextureUnit = 0;
  const inputUniforms = options.uniforms ?? ({} as U);
  const liveUniforms = createRuntimeUniforms(inputUniforms, {
    devicePixelRatio,
  });
  const customUniforms = Object.entries(liveUniforms).map(([name, uniform]) => {
    const uniformType = uniform.schema.type;
    return createWebGLUniformBinding(
      gl,
      program,
      name,
      uniform,
      uniformType === "texture2D" ? nextTextureUnit++ : 0,
    );
  });

  // --- Resize handling ---
  // Store pending size from ResizeObserver; apply inside the render loop
  // so the resize and redraw happen in the same frame — no blank-canvas flicker.
  const glRef = gl;
  let pendingWidth = canvas.clientWidth * devicePixelRatio;
  let pendingHeight = canvas.clientHeight * devicePixelRatio;
  let mouseX = 0;
  let mouseY = 0;

  function handlePointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    mouseX = (event.clientX - rect.left) * scaleX;
    mouseY = (rect.bottom - event.clientY) * scaleY;
  }

  canvas.addEventListener("pointermove", handlePointerMove);

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    const { inlineSize: w, blockSize: h } = entry
      .devicePixelContentBoxSize?.[0] ?? {
      inlineSize: entry.contentRect.width * devicePixelRatio,
      blockSize: entry.contentRect.height * devicePixelRatio,
    };
    pendingWidth = Math.round(w);
    pendingHeight = Math.round(h);
  });
  observer.observe(canvas, { box: "device-pixel-content-box" });

  // Apply initial size immediately so the first frame is correctly sized
  canvas.width = pendingWidth;
  canvas.height = pendingHeight;

  // --- Render loop ---
  let rafId: number;
  let destroyed = false;

  function render(now: number) {
    if (destroyed) return;

    // Apply any pending resize before drawing — same frame, no flicker
    if (canvas.width !== pendingWidth || canvas.height !== pendingHeight) {
      canvas.width = pendingWidth;
      canvas.height = pendingHeight;
    }

    const t = now / 1000; // ms → seconds
    glRef.viewport(0, 0, canvas.width, canvas.height);
    glRef.uniform1f(uTime, t);
    glRef.uniform2f(uResolution, canvas.width, canvas.height);
    glRef.uniform2f(uMouse, mouseX, mouseY);
    for (const runtimeUniform of customUniforms) {
      runtimeUniform.bindSampler?.(); // always — survives program re-links
      if (runtimeUniform.uniform.consumeDirty()) runtimeUniform.apply();
    }
    glRef.drawArrays(glRef.TRIANGLES, 0, 3); // 3 vertices — one oversized triangle

    rafId = requestAnimationFrame(render);
  }

  rafId = requestAnimationFrame(render);

  // --- Cleanup ---
  return {
    u: liveUniforms,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      for (const runtimeUniform of customUniforms) runtimeUniform.destroy?.();
      glRef.deleteShader(vert);
      glRef.deleteShader(frag);
      glRef.deleteProgram(program);
    },
  };
}
