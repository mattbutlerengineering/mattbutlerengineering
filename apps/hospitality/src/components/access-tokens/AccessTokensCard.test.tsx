import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import type { AccessToken, MintedAccessToken } from "@mbe/types";

const mint = vi.fn();
const revoke = vi.fn();
const refetch = vi.fn();
const tokensQuery = vi.hoisted(() => ({
  value: { data: undefined, isLoading: false, error: null } as {
    data: AccessToken[] | undefined;
    isLoading: boolean;
    error: Error | null;
  },
}));

vi.mock("../../hooks/useAccessTokens.js", () => ({
  useAccessTokens: () => ({ ...tokensQuery.value, refetch }),
  useMintAccessToken: () => mint,
  useRevokeAccessToken: () => ({ mutateAsync: revoke }),
}));

import { AccessTokensCard } from "./AccessTokensCard.js";

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const claudeToken: AccessToken = {
  id: "tok-1",
  name: "Claude Desktop",
  prefix: "mbe_pat_ab12",
  createdAt: "2026-11-01T10:00:00.000Z",
  lastUsedAt: "2026-11-20T10:00:00.000Z",
  expiresAt: "2027-02-01T10:00:00.000Z",
};
const idleToken: AccessToken = {
  id: "tok-2",
  name: "Laptop",
  prefix: "mbe_pat_cd34",
  createdAt: "2026-11-02T10:00:00.000Z",
  lastUsedAt: null,
  expiresAt: null,
};

const minted: MintedAccessToken = {
  ...claudeToken,
  id: "tok-3",
  name: "Cursor",
  prefix: "mbe_pat_ef56",
  token: "mbe_pat_ef56_fake",
};

function renderCard() {
  return render(
    <main>
      <AccessTokensCard />
    </main>
  );
}

describe("AccessTokensCard", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    tokensQuery.value = { data: [claudeToken, idleToken], isLoading: false, error: null };
    mint.mockResolvedValue(minted);
    revoke.mockResolvedValue(undefined);
  });

  it("states the scope plainly", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Connect an AI assistant" })).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/every venue you belong to/i)).toBeInTheDocument();
  });

  it("lists each token with its name, last use and expiry", () => {
    renderCard();
    const row = screen.getByRole("listitem", { name: "Claude Desktop" });
    expect(within(row).getByText(/mbe_pat_ab12/)).toBeInTheDocument();
    expect(within(row).getByText(/Last used/)).toBeInTheDocument();
    const idle = screen.getByRole("listitem", { name: "Laptop" });
    expect(within(idle).getByText(/Never used/)).toBeInTheDocument();
    expect(within(idle).getByText(/Never expires/)).toBeInTheDocument();
  });

  it("shows the plaintext once with a copy button and a one-time note", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderCard();

    await userEvent.type(screen.getByLabelText("Token name"), "Cursor");
    await userEvent.click(screen.getByRole("button", { name: "Create token" }));

    await waitFor(() => expect(screen.getByDisplayValue("mbe_pat_ef56_fake")).toBeInTheDocument());
    expect(mint).toHaveBeenCalledWith({ name: "Cursor", expiresInDays: 90 });
    expect(screen.getByText(/won.t see this again/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy token" }));
    expect(writeText).toHaveBeenCalledWith("mbe_pat_ef56_fake");
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByDisplayValue("mbe_pat_ef56_fake")).not.toBeInTheDocument();
  });

  it("does not mint without a name", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(mint).not.toHaveBeenCalled();
  });

  it("revokes only after the confirm", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Revoke Claude Desktop" }));
    expect(revoke).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("tok-1"));
  });

  it("explains a full token cap from the 409", async () => {
    mint.mockRejectedValue(Object.assign(new Error("Too many"), { status: 409 }));
    renderCard();
    await userEvent.type(screen.getByLabelText("Token name"), "Eleventh");
    await userEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("offers a retry when the list fails to load", () => {
    tokensQuery.value = { data: undefined, isLoading: false, error: new Error("boom") };
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = renderCard();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
