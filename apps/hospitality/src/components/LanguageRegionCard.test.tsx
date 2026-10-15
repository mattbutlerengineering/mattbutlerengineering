import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { localeRuntime } from "../i18n/runtime.js";
import esMX from "../i18n/catalogs/es-MX.json";
import { LanguageRegionCard } from "./LanguageRegionCard.js";

afterEach(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("LanguageRegionCard", () => {
  it("shows the locale picker and an en-US format preview", () => {
    render(<LanguageRegionCard />);
    expect(screen.getByText("Language & region")).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByTestId("format-preview")).toHaveTextContent("7:30 PM");
    expect(screen.getByTestId("format-preview")).toHaveTextContent("$1,234.50");
  });

  it("previews formats in the selected locale and shows the machine-translation line", async () => {
    localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
    await localeRuntime.i18n.changeLanguage("es-MX");
    render(<LanguageRegionCard />);
    expect(screen.getByText("Idioma y región")).toBeInTheDocument();
    expect(screen.getByTestId("format-preview")).toHaveTextContent("13/10/2026");
    expect(screen.getByText("Las traducciones son automáticas.")).toBeInTheDocument();
  });
});
