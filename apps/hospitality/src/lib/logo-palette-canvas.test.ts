import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LOGO_BYTES, classifyLogoFile, readLogoPalette } from "./logo-palette-canvas.js";

function logoFile(overrides: { type?: string; size?: number } = {}): File {
  const file = new File([new Uint8Array(4)], "logo.png", {
    type: overrides.type ?? "image/png",
  });
  if (overrides.size !== undefined) {
    Object.defineProperty(file, "size", { value: overrides.size });
  }
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
});

describe("classifyLogoFile", () => {
  it("accepts the raster formats a canvas can decode", () => {
    expect(classifyLogoFile({ type: "image/png", size: 1024 })).toBeNull();
    expect(classifyLogoFile({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(classifyLogoFile({ type: "image/webp", size: 1024 })).toBeNull();
  });

  it("rejects a type a canvas cannot sample pixels from", () => {
    expect(classifyLogoFile({ type: "image/svg+xml", size: 1024 })).toBe("unsupported-type");
    expect(classifyLogoFile({ type: "application/pdf", size: 1024 })).toBe("unsupported-type");
    expect(classifyLogoFile({ type: "", size: 1024 })).toBe("unsupported-type");
  });

  it("rejects a file over the byte cap before any decoding happens", () => {
    expect(classifyLogoFile({ type: "image/png", size: MAX_LOGO_BYTES })).toBeNull();
    expect(classifyLogoFile({ type: "image/png", size: MAX_LOGO_BYTES + 1 })).toBe("too-large");
  });
});

describe("readLogoPalette", () => {
  it("refuses an unsupported type without touching the decoder", async () => {
    const decode = vi.fn();
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = decode;
    await expect(readLogoPalette(logoFile({ type: "image/gif" }))).resolves.toEqual({
      ok: false,
      reason: "unsupported-type",
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it("refuses an oversized file without touching the decoder", async () => {
    const decode = vi.fn();
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = decode;
    await expect(readLogoPalette(logoFile({ size: MAX_LOGO_BYTES + 1 }))).resolves.toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it("reports a decode failure instead of throwing", async () => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = vi
      .fn()
      .mockRejectedValue(new Error("corrupt"));
    await expect(readLogoPalette(logoFile())).resolves.toEqual({
      ok: false,
      reason: "decode-failed",
    });
  });

  it("downscales a huge logo before sampling and returns the core's palette", async () => {
    const close = vi.fn();
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 4000, height: 3000, close });

    const drawImage = vi.fn();
    const pixels = 256 * 192;
    const data = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      data.set([122, 31, 61, 255], i * 4);
    }
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData: () => ({ data }),
    } as unknown as CanvasRenderingContext2D);

    await expect(readLogoPalette(logoFile())).resolves.toEqual({
      ok: true,
      palette: ["#7a1f3d"],
    });
    // Drawn into the 256-edge budget, not at the logo's own 4000x3000.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 256, 192);
    expect(close).toHaveBeenCalled();
  });

  it("reports a decode failure when no 2d context is available", async () => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 10, height: 10, close: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(readLogoPalette(logoFile())).resolves.toEqual({
      ok: false,
      reason: "decode-failed",
    });
  });

  it("returns an empty palette for a logo with no usable colours", async () => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 10, height: 10, close: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(10 * 10 * 4) }),
    } as unknown as CanvasRenderingContext2D);
    await expect(readLogoPalette(logoFile())).resolves.toEqual({ ok: true, palette: [] });
  });
});
