export type CanvasSignals = {
  applySize(): void;
  readonly mouseX: number;
  readonly mouseY: number;
  destroy(): void;
};

export function observeCanvas(canvas: HTMLCanvasElement): CanvasSignals {
  let pendingWidth = canvas.clientWidth * devicePixelRatio;
  let pendingHeight = canvas.clientHeight * devicePixelRatio;
  let mouseX = 0;
  let mouseY = 0;

  function handlePointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (rect.bottom - event.clientY) * (canvas.height / rect.height);
  }
  canvas.addEventListener("pointermove", handlePointerMove);

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    const size = entry.devicePixelContentBoxSize?.[0] ?? {
      inlineSize: entry.contentRect.width * devicePixelRatio,
      blockSize: entry.contentRect.height * devicePixelRatio,
    };
    pendingWidth = Math.round(size.inlineSize);
    pendingHeight = Math.round(size.blockSize);
  });
  observer.observe(canvas, { box: "device-pixel-content-box" });

  return {
    applySize() {
      if (canvas.width !== pendingWidth || canvas.height !== pendingHeight) {
        canvas.width = pendingWidth;
        canvas.height = pendingHeight;
      }
    },
    get mouseX() {
      return mouseX;
    },
    get mouseY() {
      return mouseY;
    },
    destroy() {
      observer.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
    },
  };
}
