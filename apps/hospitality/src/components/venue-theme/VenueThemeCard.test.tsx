import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Venue } from "@mbe/types";
import type * as LogoPaletteCanvas from "../../lib/logo-palette-canvas.js";
import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { VenueThemeCard } from "./VenueThemeCard.js";

const update = vi.fn();
vi.mock("../../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ venues: { update } }),
}));

const readLogoPalette = vi.fn();
vi.mock("../../lib/logo-palette-canvas.js", async (importOriginal) => ({
  ...(await importOriginal<typeof LogoPaletteCanvas>()),
  readLogoPalette: (...args: unknown[]) => readLogoPalette(...args),
}));

const AXE = { rules: { "color-contrast": { enabled: false } } };

const venue: Venue = {
  id: "v1",
  venueGroupId: null,
  name: "V",
  slug: "v",
  ianaTimezone: "UTC",
  currencyCode: "USD",
  operatingHours: null,
  settings: { maxPartySize: 8 },
  createdAt: "",
  updatedAt: "",
};
const ctx: VenueContextValue = {
  venues: [venue],
  selectedVenueId: "v1",
  selectedVenue: venue,
  setVenueId: () => {},
  isLoading: false,
  venuesError: null,
  isMultiVenue: false,
  refetchVenues: async () => {},
};

function setup() {
  return render(
    <main>
      <QueryClientProvider client={new QueryClient()}>
        <VenueContext.Provider value={ctx}>
          <VenueThemeCard />
        </VenueContext.Provider>
      </QueryClientProvider>
    </main>
  );
}

const accent = () => screen.getByLabelText("Accent colour");
const hover = () => screen.getByLabelText("Accent hover colour");
const save = () => screen.getByRole("button", { name: "Save theme" });

/** Pick a logo through the file input rialto's ImageUpload keeps hidden. */
function pickLogo(container: HTMLElement, type = "image/png") {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input rendered");
  fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type })] } });
}

beforeEach(() => {
  update.mockReset().mockResolvedValue(venue);
  readLogoPalette.mockReset().mockResolvedValue({ ok: true, palette: ["#7a1f3d", "#1ec81e"] });
});

describe("VenueThemeCard", () => {
  it("has no axe violations", async () => {
    const { container } = setup();
    expect((await axe(container, AXE)).violations).toEqual([]);
  });

  it("saves a readable manual palette alongside existing settings", async () => {
    setup();
    fireEvent.change(accent(), { target: { value: "#7a1f3d" } });
    fireEvent.change(hover(), { target: { value: "#8c2a4a" } });
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith("v1", {
      settings: {
        maxPartySize: 8,
        theme: { accent: "#7a1f3d", accentHover: "#8c2a4a", source: "manual" },
      },
    });
  });

  it("updates the preview as colours are typed", () => {
    setup();
    fireEvent.change(accent(), { target: { value: "#7a1f3d" } });
    fireEvent.change(hover(), { target: { value: "#8c2a4a" } });
    expect(screen.getByTestId("theme-preview").style.getPropertyValue("--rialto-accent")).toBe(
      "#7a1f3d"
    );
  });

  it("blocks saving an unreadable palette and says why", () => {
    setup();
    fireEvent.change(accent(), { target: { value: "#808080" } });
    fireEvent.change(hover(), { target: { value: "#888888" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/contrast/i);
    expect(screen.getByRole("button", { name: "Save theme" })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks saving malformed hex", () => {
    setup();
    fireEvent.change(accent(), { target: { value: "purple" } });
    expect(save()).toBeDisabled();
  });
});

describe("VenueThemeCard — palette from a logo", () => {
  it("fills the palette from the logo and saves it as extracted", async () => {
    const { container } = setup();
    pickLogo(container);
    await waitFor(() => expect(accent()).toHaveValue("#7a1f3d"));
    expect(hover()).toHaveValue("#8a3a54");

    fireEvent.click(save());
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith("v1", {
      settings: {
        maxPartySize: 8,
        theme: { accent: "#7a1f3d", accentHover: "#8a3a54", source: "extracted" },
      },
    });
  });

  it("flips the source to manual once the operator adjusts a colour", async () => {
    const { container } = setup();
    pickLogo(container);
    await waitFor(() => expect(accent()).toHaveValue("#7a1f3d"));

    fireEvent.change(accent(), { target: { value: "#10203a" } });
    fireEvent.click(save());
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith("v1", {
      settings: {
        maxPartySize: 8,
        theme: { accent: "#10203a", accentHover: "#8a3a54", source: "manual" },
      },
    });
  });

  it("blocks saving an unreadable extracted palette exactly as a manual one", async () => {
    readLogoPalette.mockResolvedValue({ ok: true, palette: ["#808080"] });
    const { container } = setup();
    pickLogo(container);
    await waitFor(() => expect(accent()).toHaveValue("#808080"));

    expect(screen.getByText(/contrast/i)).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("says so when the logo holds no usable colour, and leaves the fields alone", async () => {
    readLogoPalette.mockResolvedValue({ ok: true, palette: [] });
    const { container } = setup();
    pickLogo(container);
    await waitFor(() => expect(screen.getByText(/no usable colours/i)).toBeInTheDocument());
    expect(accent()).toHaveValue("");
  });

  it("reports a logo it could not read", async () => {
    readLogoPalette.mockResolvedValue({ ok: false, reason: "decode-failed" });
    const { container } = setup();
    pickLogo(container);
    await waitFor(() => expect(screen.getByText(/couldn't be read/i)).toBeInTheDocument());
  });

  it("reports a file type that is not an image rialto accepts", async () => {
    const { container } = setup();
    pickLogo(container, "image/gif");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(readLogoPalette).not.toHaveBeenCalled();
  });
});
