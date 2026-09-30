import { describe, it, expect } from "vitest";
import { candidates, main, resolveBrowser } from "../ui-quality/browser.mjs";

const HOME = "/home/u";
const CACHE = `${HOME}/.cache/ms-playwright`;

/**
 * An in-memory filesystem: `files` are executables that exist; directories are
 * inferred from their prefixes.
 */
function fakeFs(files) {
  const set = new Set(files);
  const exists = (p) => set.has(p) || files.some((f) => f.startsWith(`${p}/`));
  const readdir = (dir) => {
    if (!exists(dir) || set.has(dir)) throw new Error(`ENOENT ${dir}`);
    const names = new Set();
    for (const f of files) {
      if (f.startsWith(`${dir}/`)) names.add(f.slice(dir.length + 1).split("/")[0]);
    }
    return [...names].sort();
  };
  return { exists, readdir };
}

const deps = (overrides = {}) => ({
  env: {},
  homedir: HOME,
  registryPath: () => null,
  which: () => null,
  ...fakeFs([]),
  ...overrides,
});

describe("candidates — the resolution order", () => {
  it("is env → Playwright registry path → any cached chromium/headless-shell (newest first) → which", () => {
    const fs = fakeFs([
      "/opt/env-chrome",
      "/opt/registry-chrome",
      `${CACHE}/chromium-1194/chrome-linux/chrome`,
      `${CACHE}/chromium_headless_shell-1200/chrome-linux/headless_shell`,
      `${CACHE}/ffmpeg-1011/ffmpeg-linux`,
      "/usr/bin/chromium",
    ]);
    const list = candidates(
      deps({
        ...fs,
        env: { UI_QUALITY_CHROMIUM: "/opt/env-chrome" },
        registryPath: () => "/opt/registry-chrome",
        which: (name) => (name === "chromium" ? "/usr/bin/chromium" : null),
      })
    );
    expect(list).toEqual([
      "/opt/env-chrome",
      "/opt/registry-chrome",
      `${CACHE}/chromium_headless_shell-1200/chrome-linux/headless_shell`,
      `${CACHE}/chromium-1194/chrome-linux/chrome`,
      "/usr/bin/chromium",
    ]);
  });

  it("skips a registry path that is not on disk and finds a revision it does not know", () => {
    const fs = fakeFs([`${CACHE}/chromium_headless_shell-9999/chrome-linux/headless_shell`]);
    const list = candidates(deps({ ...fs, registryPath: () => `${CACHE}/chromium-1243/x/chrome` }));
    expect(list).toEqual([`${CACHE}/chromium_headless_shell-9999/chrome-linux/headless_shell`]);
  });

  it("finds a macOS .app binary and a headless-shell binary in the macOS cache", () => {
    const mac = `${HOME}/Library/Caches/ms-playwright`;
    const app = `${mac}/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
    const shell = `${mac}/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
    expect(candidates(deps(fakeFs([app, shell])))).toEqual([shell, app]);
  });

  it("honours PLAYWRIGHT_BROWSERS_PATH as a cache root", () => {
    const bin = "/pw/chromium-1/chrome-linux/chrome";
    expect(
      candidates(deps({ ...fakeFs([bin]), env: { PLAYWRIGHT_BROWSERS_PATH: "/pw" } }))
    ).toEqual([bin]);
  });
});

describe("resolveBrowser", () => {
  it("returns the first candidate that launches, trying each in order", async () => {
    const tried = [];
    const fs = fakeFs(["/a", "/b", "/c"]);
    const path = await resolveBrowser(
      deps({
        ...fs,
        env: { UI_QUALITY_CHROMIUM: "/a" },
        registryPath: () => "/b",
        which: () => "/c",
        launch: async (p) => {
          tried.push(p);
          if (p !== "/b") throw new Error("nope");
        },
      })
    );
    expect(path).toBe("/b");
    expect(tried).toEqual(["/a", "/b"]);
  });

  it("returns null when nothing launches", async () => {
    const fs = fakeFs(["/a"]);
    const path = await resolveBrowser(
      deps({
        ...fs,
        env: { UI_QUALITY_CHROMIUM: "/a" },
        launch: async () => {
          throw new Error("no");
        },
      })
    );
    expect(path).toBeNull();
  });
});

describe("browser.mjs resolve", () => {
  const io = () => {
    const out = [];
    const err = [];
    return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
  };

  it("prints the launchable path and exits 0", async () => {
    const { out, io: sink } = io();
    const code = await main(["resolve"], {
      ...deps({ ...fakeFs(["/x"]), which: () => "/x", launch: async () => {} }),
      ...sink,
    });
    expect(code).toBe(0);
    expect(out.join("")).toBe("/x\n");
  });

  it("exits 3 when no candidate launches, naming what it tried", async () => {
    const { out, err, io: sink } = io();
    const code = await main(["resolve"], {
      ...deps({
        ...fakeFs(["/x"]),
        which: () => "/x",
        launch: async () => {
          throw new Error("bad revision");
        },
      }),
      ...sink,
    });
    expect(code).toBe(3);
    expect(out.join("")).toBe("");
    expect(err.join("")).toMatch(/\/x/);
  });

  it("exits 3 when there is no candidate at all", async () => {
    const { io: sink } = io();
    expect(await main(["resolve"], { ...deps(), launch: async () => {}, ...sink })).toBe(3);
  });

  it("bare invocation prints usage and exits 2", async () => {
    const { err, io: sink } = io();
    expect(await main([], { ...deps(), ...sink })).toBe(2);
    expect(err.join("")).toMatch(/resolve/);
  });
});
