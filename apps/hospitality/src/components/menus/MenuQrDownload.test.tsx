import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const qr = vi.hoisted(() => ({
  toDataURL: vi.fn(),
  toString: vi.fn(),
}));

vi.mock("qrcode", () => ({ default: qr }));

import { MenuQrDownload } from "./MenuQrDownload.js";

const URL_UNDER_TEST = "https://hospitality.example/menu/oak-table/dinner";

describe("MenuQrDownload", () => {
  let clicked: { href: string; download: string }[];

  beforeEach(() => {
    qr.toDataURL.mockReset().mockResolvedValue("data:image/png;base64,AAAA");
    qr.toString.mockReset().mockResolvedValue("<svg></svg>");
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    Element.prototype.scrollIntoView = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:qr");
    URL.revokeObjectURL = vi.fn();
  });

  it("encodes the menu's public URL as a 512px PNG by default", async () => {
    render(<MenuQrDownload url={URL_UNDER_TEST} active menuSlug="dinner" />);

    await userEvent.click(screen.getByRole("button", { name: "Download QR" }));

    await waitFor(() => expect(qr.toDataURL).toHaveBeenCalledTimes(1));
    expect(qr.toDataURL).toHaveBeenCalledWith(URL_UNDER_TEST, { width: 512, margin: 2 });
    expect(clicked).toEqual([
      { href: "data:image/png;base64,AAAA", download: "dinner-qr-512.png" },
    ]);
  });

  it("downloads an SVG at the chosen size", async () => {
    render(<MenuQrDownload url={URL_UNDER_TEST} active menuSlug="dinner" />);

    await userEvent.click(screen.getByRole("combobox", { name: "Format" }));
    await userEvent.click(screen.getByRole("option", { name: "SVG" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Size" }));
    await userEvent.click(screen.getByRole("option", { name: "1024 px" }));
    await userEvent.click(screen.getByRole("button", { name: "Download QR" }));

    await waitFor(() => expect(qr.toString).toHaveBeenCalledTimes(1));
    expect(qr.toString).toHaveBeenCalledWith(URL_UNDER_TEST, {
      type: "svg",
      width: 1024,
      margin: 2,
    });
    expect(clicked).toEqual([{ href: "blob:qr", download: "dinner-qr-1024.svg" }]);
  });

  it("warns that the QR will not work until the menu is Active", () => {
    const { rerender } = render(
      <MenuQrDownload url={URL_UNDER_TEST} active={false} menuSlug="dinner" />
    );
    expect(screen.getByText(/won.t work until the menu is Active/)).toBeInTheDocument();

    rerender(<MenuQrDownload url={URL_UNDER_TEST} active menuSlug="dinner" />);
    expect(screen.queryByText(/won.t work until the menu is Active/)).not.toBeInTheDocument();
  });
});
