import type { ReactNode } from "react";
import type * as FramerMotion from "framer-motion";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Autocomplete } from "./Autocomplete";
import { useDeviceContext } from "../../providers/useDeviceContext";

vi.mock("../../providers/useDeviceContext", () => ({ useDeviceContext: vi.fn() }));

const seen: unknown[] = [];

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => true,
    motion: {
      ...actual.motion,
      ul: ({ transition, children }: { transition?: unknown; children?: ReactNode }) => {
        seen.push(transition);
        return <ul>{children}</ul>;
      },
    },
  };
});

describe("Autocomplete — reduced motion transition (ADR-025)", () => {
  it("applies an instant transition when the device prefers reduced motion", async () => {
    seen.length = 0;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(useDeviceContext).mockReturnValue({
      pointer: "fine",
      viewport: "desktop",
      reducedMotion: true,
      colorScheme: "light",
      saveData: false,
    });
    render(<Autocomplete label="Fruit" options={[{ value: "apple", label: "Apple" }]} />);
    await userEvent.type(screen.getByLabelText("Fruit"), "a");
    expect(seen.at(-1)).toEqual({ duration: 0 });
  });
});
