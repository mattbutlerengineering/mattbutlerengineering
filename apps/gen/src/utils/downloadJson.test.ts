import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadJson } from "./downloadJson.js";

describe("downloadJson", () => {
  const originalCreateElement = document.createElement.bind(document);
  let anchorMock: HTMLAnchorElement;

  beforeEach(() => {
    anchorMock = document.createElement("a");
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") return anchorMock;
      return originalCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a Blob and sets href on anchor", () => {
    const createSpy = vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock");
    downloadJson({ key: "value" }, "test.json");
    expect(createSpy).toHaveBeenCalledOnce();
    expect(anchorMock.href).toBe("blob:mock");
    createSpy.mockRestore();
  });

  it("sets download attribute with filename", () => {
    downloadJson({ key: "value" }, "my-file.json");
    expect(anchorMock.download).toBe("my-file.json");
  });

  it("generates timestamped filename when none given", () => {
    vi.setSystemTime(new Date("2026-06-13T12:00:00Z"));
    downloadJson({ key: "value" });
    expect(anchorMock.download).toBe("gen-spec-2026-06-13T12-00-00.json");
    vi.useRealTimers();
  });

  it("triggers click on the anchor", () => {
    const clickSpy = vi.spyOn(anchorMock, "click");
    downloadJson({ key: "value" }, "test.json");
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("creates and revokes object URL", () => {
    const createSpy = vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeSpy = vi.spyOn(globalThis.URL, "revokeObjectURL");

    downloadJson({ key: "value" }, "test.json");
    expect(createSpy).toHaveBeenCalledOnce();
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock");

    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });
});
