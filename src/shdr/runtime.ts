import { compileFragment, type FragmentFn } from "./compile.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShaderOptions {
  canvas: HTMLCanvasElement;
  fragment: string | FragmentFn;
}

export interface ShaderInstance {
  /** Stop the render loop and free all WebGL resources. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Hardcoded vertex shader — draws one oversized triangle, no buffers needed
// ---------------------------------------------------------------------------

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`.trim();

// Full-screen quad as two triangles (6 vertices, xy pairs)
const QUAD = new Float32Array([
  -1, -1,   1, -1,   -1,  1,
  -1,  1,   1, -1,    1,  1,
]);

// ---------------------------------------------------------------------------
// WebGL helpers
// ---------------------------------------------------------------------------

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
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

function linkProgram(gl: WebGLRenderingContext, vert: WebGLShader, frag: WebGLShader): WebGLProgram {
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

export function createShader(options: ShaderOptions): ShaderInstance {
  const { canvas } = options;

  const glsl =
    typeof options.fragment === "string"
      ? options.fragment
      : compileFragment(options.fragment);

  // --- WebGL setup ---
  const gl = canvas.getContext("webgl");
  if (!gl) throw new Error("WebGL not supported — try a different browser");

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, glsl);
  const program = linkProgram(gl, vert, frag);

  // Geometry
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Uniform locations
  const uTime       = gl.getUniformLocation(program, "u_time");
  const uResolution = gl.getUniformLocation(program, "u_resolution");

  gl.useProgram(program);

  // --- Resize handling ---
  // Store pending size from ResizeObserver; apply it inside the render loop
  // so the resize and redraw happen in the same frame — no blank-canvas flicker.
  const glRef = gl;
  let pendingWidth  = canvas.clientWidth  * devicePixelRatio;
  let pendingHeight = canvas.clientHeight * devicePixelRatio;

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    const { inlineSize: w, blockSize: h } = entry.devicePixelContentBoxSize?.[0]
      ?? { inlineSize: entry.contentRect.width  * devicePixelRatio,
           blockSize:  entry.contentRect.height * devicePixelRatio };
    pendingWidth  = Math.round(w);
    pendingHeight = Math.round(h);
  });
  observer.observe(canvas, { box: "device-pixel-content-box" });

  // Apply initial size immediately so the first frame is correctly sized
  canvas.width  = pendingWidth;
  canvas.height = pendingHeight;

  // --- Render loop ---
  let rafId: number;
  let destroyed = false;

  function render(now: number) {
    if (destroyed) return;

    // Apply any pending resize before drawing — same frame, no flicker
    if (canvas.width !== pendingWidth || canvas.height !== pendingHeight) {
      canvas.width  = pendingWidth;
      canvas.height = pendingHeight;
    }

    const t = now / 1000; // ms → seconds
    glRef.viewport(0, 0, canvas.width, canvas.height);
    glRef.uniform1f(uTime, t);
    glRef.uniform2f(uResolution, canvas.width, canvas.height);
    glRef.drawArrays(glRef.TRIANGLES, 0, 6);

    rafId = requestAnimationFrame(render);
  }

  rafId = requestAnimationFrame(render);

  // --- Cleanup ---
  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      glRef.deleteBuffer(buf);
      glRef.deleteShader(vert);
      glRef.deleteShader(frag);
      glRef.deleteProgram(program);
    },
  };
}
