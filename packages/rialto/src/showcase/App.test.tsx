import { render, screen } from "@testing-library/react";
import { App } from "./App";

/* The showcase is excluded from coverage and `App.vibes.test.tsx` only reads
 * the exported `VIBES` list, so before this file nothing in CI ever mounted
 * the app. #6169 fixed a runtime `TypeError: Cannot read properties of
 * undefined (reading 'map')` that only an uncommitted `render(<App />)` probe
 * caught. This is that probe, committed: mount the whole app the way
 * `main.tsx` does and fail on a throw or a logged React error. */
describe("showcase App", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("mounts every section without throwing or logging an error", () => {
    render(<App />);

    // `getByRole` throws when nothing matches. jest-dom matchers are not typed
    // under tsconfig.showcase.json, so these assert with core matchers.
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.textContent).toBe("Rialto Component Showcase");

    // The last section rendering inside <main> means every section before it
    // mounted too.
    const main = screen.getByRole("main");
    const lastSection = screen.getByRole("heading", { level: 2, name: "Layout" });
    expect(main.contains(lastSection)).toBe(true);

    expect(consoleError).not.toHaveBeenCalled();
  });
});
