import { describe, it, expect, vi, afterEach } from "vitest";
import { unregisterStaleServiceWorkers } from "./service-worker";

describe("unregisterStaleServiceWorkers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unregisters non-exempted service workers", async () => {
    const unregisterMock = vi.fn(() => Promise.resolve(true));
    const exemptedUnregister = vi.fn(() => Promise.resolve(true));
    const registrations = [
      { scope: "https://example.com/", unregister: unregisterMock },
      { scope: "https://example.com/hospitality/sw.js", unregister: exemptedUnregister },
    ];

    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistrations: vi.fn(() => Promise.resolve(registrations)) },
      writable: true,
      configurable: true,
    });

    vi.spyOn(console, "info").mockImplementation(() => {});
    unregisterStaleServiceWorkers();

    await vi.waitFor(() => {
      expect(unregisterMock).toHaveBeenCalledOnce();
    });
    expect(exemptedUnregister).not.toHaveBeenCalled();
  });

  it("respects custom exempted scopes", async () => {
    const unregisterA = vi.fn(() => Promise.resolve(true));
    const unregisterB = vi.fn(() => Promise.resolve(true));
    const registrations = [
      { scope: "https://example.com/app/", unregister: unregisterA },
      { scope: "https://example.com/admin/", unregister: unregisterB },
    ];

    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistrations: vi.fn(() => Promise.resolve(registrations)) },
      writable: true,
      configurable: true,
    });

    vi.spyOn(console, "info").mockImplementation(() => {});
    unregisterStaleServiceWorkers(["/admin/"]);

    await vi.waitFor(() => {
      expect(unregisterA).toHaveBeenCalledOnce();
    });
    expect(unregisterB).not.toHaveBeenCalled();
  });
});
