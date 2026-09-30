import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pngSize, pngSizeOfFile } from "../ui-quality/png.mjs";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Signature + an IHDR chunk (length 13, type, width, height, 8-bit RGB, CRC bytes) — no image library. */
function pngHeader(width, height) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16);
  ihdr.writeUInt8(2, 17);
  return Buffer.concat([SIGNATURE, ihdr]);
}

describe("pngSize", () => {
  it("reads width × height from the IHDR chunk", () => {
    expect(pngSize(pngHeader(1280, 720))).toEqual({ width: 1280, height: 720 });
    expect(pngSize(pngHeader(1280, 4529))).toEqual({ width: 1280, height: 4529 });
  });

  it("throws on a non-PNG, a truncated header, or a first chunk that is not IHDR", () => {
    expect(() => pngSize(Buffer.from("GIF89a not a png at all, padded out"))).toThrow(/not a PNG/);
    expect(() => pngSize(pngHeader(1280, 720).subarray(0, 20))).toThrow(/not a PNG/);
    const wrongChunk = pngHeader(1280, 720);
    wrongChunk.write("IDAT", 12, "ascii");
    expect(() => pngSize(wrongChunk)).toThrow(/IHDR/);
  });

  it("pngSizeOfFile reads a file and names it when it is not a PNG", () => {
    const dir = mkdtempSync(join(tmpdir(), "uiq-png-"));
    writeFileSync(join(dir, "a.png"), pngHeader(1280, 720));
    writeFileSync(join(dir, "b.png"), "hello");
    expect(pngSizeOfFile(join(dir, "a.png"))).toEqual({ width: 1280, height: 720 });
    expect(() => pngSizeOfFile(join(dir, "b.png"))).toThrow(/b\.png/);
  });
});
