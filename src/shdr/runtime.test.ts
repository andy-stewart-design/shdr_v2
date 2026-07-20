import { afterEach, describe, expect, it, vi } from "vitest";
import { createShader } from "./runtime.ts";

const FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`;

type Listener = EventListenerOrEventListenerObject;

function makeRuntimeFixture() {
  const calls = {
    drawArrays: 0,
    deleteShader: 0,
    deleteProgram: 0,
    cancelAnimationFrame: [] as number[],
    observerDisconnect: 0,
  };
  const listeners = new Map<string, Listener>();
  let scheduledFrame: FrameRequestCallback | undefined;

  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TRIANGLES: 5,
    TEXTURE0: 6,
    TEXTURE_2D: 7,
    TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9,
    CLAMP_TO_EDGE: 10,
    TEXTURE_MIN_FILTER: 11,
    TEXTURE_MAG_FILTER: 12,
    LINEAR: 13,
    RGBA: 14,
    UNSIGNED_BYTE: 15,
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    getShaderInfoLog: () => null,
    deleteShader: () => calls.deleteShader++,
    createProgram: () => ({}),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getProgramInfoLog: () => null,
    deleteProgram: () => calls.deleteProgram++,
    getUniformLocation: () => ({}),
    useProgram: () => undefined,
    viewport: () => undefined,
    uniform1f: () => undefined,
    uniform2f: () => undefined,
    uniform1i: () => undefined,
    drawArrays: () => calls.drawArrays++,
  };

  const canvas = {
    clientWidth: 100,
    clientHeight: 50,
    width: 0,
    height: 0,
    getContext: () => gl,
    addEventListener: (name: string, listener: Listener) => {
      listeners.set(name, listener);
    },
    removeEventListener: (name: string) => {
      listeners.delete(name);
    },
    getBoundingClientRect: () => ({
      width: 100,
      height: 50,
      left: 0,
      bottom: 50,
    }),
  } as unknown as HTMLCanvasElement;

  class ResizeObserverFake {
    observe() {}
    disconnect() {
      calls.observerDisconnect++;
    }
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverFake);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    scheduledFrame = callback;
    return 42;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    calls.cancelAnimationFrame.push(id);
  });

  return {
    calls,
    canvas,
    runFrame() {
      scheduledFrame?.(1000);
    },
    listeners,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createShader baseline", () => {
  it("renders scheduled frames and releases lifecycle resources on destroy", () => {
    const fixture = makeRuntimeFixture();
    const shader = createShader({
      canvas: fixture.canvas,
      shader: {
        target: "glsl-es-300",
        fragment: FRAGMENT,
        uniforms: {},
        metadata: {},
      },
    });

    fixture.runFrame();
    expect(fixture.calls.drawArrays).toBe(1);
    expect(fixture.listeners.has("pointermove")).toBe(true);

    shader.destroy();

    expect(fixture.calls.cancelAnimationFrame).toEqual([42]);
    expect(fixture.calls.observerDisconnect).toBe(1);
    expect(fixture.listeners.has("pointermove")).toBe(false);
    expect(fixture.calls.deleteShader).toBe(2);
    expect(fixture.calls.deleteProgram).toBe(1);
  });
});
