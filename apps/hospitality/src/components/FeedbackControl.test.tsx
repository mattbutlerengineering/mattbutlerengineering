import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ApiClientError } from "@mbe/api-client";
import { FeedbackControl } from "./FeedbackControl.js";

const isAvailable = vi.fn();
const submit = vi.fn();

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: () => ({ feedback: { isAvailable, submit } }),
}));

vi.mock("../hooks/useUsers.js", () => ({
  useCurrentUser: () => ({ data: { id: "user-9" } }),
}));

function renderControl() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/reservations"]}>
        <FeedbackControl />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FeedbackControl", () => {
  beforeEach(() => {
    isAvailable.mockReset();
    submit.mockReset();
    isAvailable.mockResolvedValue(true);
  });

  it("renders nothing when the server has no feedback token", async () => {
    isAvailable.mockResolvedValue(false);
    renderControl();

    await waitFor(() => expect(isAvailable).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Send feedback" })).not.toBeInTheDocument();
  });

  it("renders nothing when the availability probe fails", async () => {
    isAvailable.mockRejectedValue(new Error("down"));
    renderControl();

    await waitFor(() => expect(isAvailable).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Send feedback" })).not.toBeInTheDocument();
  });

  it("shows what will be attached and submits with that context", async () => {
    submit.mockResolvedValue({ issueNumber: 55, url: "https://github.com/o/r/issues/55" });
    const user = userEvent.setup();
    renderControl();

    await user.click(await screen.findByRole("button", { name: "Send feedback" }));
    expect(screen.getByText("We'll include:")).toBeInTheDocument();
    expect(screen.getByText("/reservations")).toBeInTheDocument();
    expect(screen.getByText("user-9")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Your message/), "Walk-in button is hard to find.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0]![0]).toMatchObject({
      type: "bug",
      message: "Walk-in button is hard to find.",
      context: { app: "hospitality", route: "/reservations" },
    });
    expect(await screen.findByText(/issue #55/)).toBeInTheDocument();
  });

  it("keeps the draft and says why when the server refuses", async () => {
    submit.mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Too Many Requests",
          status: 429,
          detail: "You have sent a lot of feedback recently.",
        },
        "POST",
        "/api/gen/feedback"
      )
    );
    const user = userEvent.setup();
    renderControl();

    await user.click(await screen.findByRole("button", { name: "Send feedback" }));
    await user.type(screen.getByLabelText(/Your message/), "Walk-in button is hard to find.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText(/Your message/)).toHaveValue("Walk-in button is hard to find.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});
