import type { ReactNode } from "react";
import type * as FramerMotion from "framer-motion";
import { render } from "@testing-library/react";
import { Banner } from "./Banner";
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
      div: ({ transition, children }: { transition?: unknown; children?: ReactNode }) => {
        seen.push(transition);
        return <div>{children}</div>;
      },
    },
  };
});

describe("Banner — reduced motion transition (ADR-025)", () => {
  it("applies an instant transition when the device prefers reduced motion", () => {
    seen.length = 0;
    vi.mocked(useDeviceContext).mockReturnValue({
      pointer: "fine",
      viewport: "desktop",
      reducedMotion: true,
      colorScheme: "light",
      saveData: false,
    });
    render(<Banner>Hello</Banner>);
    expect(seen.at(-1)).toEqual({ duration: 0 });
  });
});
