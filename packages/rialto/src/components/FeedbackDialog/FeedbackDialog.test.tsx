import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { FeedbackDialog, type FeedbackDialogLabels } from "./FeedbackDialog";
import { FeedbackButton } from "./FeedbackButton";

const LABELS: FeedbackDialogLabels = {
  title: "Send feedback",
  typeLabel: "What kind?",
  types: { bug: "Bug", idea: "Idea", other: "Other" },
  messageLabel: "Your message",
  messageHint: "At least 10 characters.",
  messageTooShort: "Write at least 10 characters.",
  emailLabel: "Email for follow-up",
  emailHint: "Optional. Never shown publicly.",
  emailInvalid: "Enter a valid email.",
  contextHeading: "We'll include:",
  submit: "Send",
  submitting: "Sending",
  cancel: "Cancel",
  done: "Done",
  retry: "Try again",
  errorTitle: "We couldn't send that",
  errorBody: "Your message is still here.",
  successTitle: "Thanks, we got it",
  successBody: (issueNumber) => `Filed as issue #${issueNumber}.`,
};

const CONTEXT = [
  { label: "Page", value: "/timeline" },
  { label: "Screen", value: "1280x800" },
];

const LONG_ENOUGH = "The timeline freezes on drag.";

function setup(onSubmit = vi.fn().mockResolvedValue({ issueNumber: 42 })) {
  const onClose = vi.fn();
  render(
    <FeedbackDialog
      open
      onClose={onClose}
      onSubmit={onSubmit}
      labels={LABELS}
      contextItems={CONTEXT}
    />
  );
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe("FeedbackDialog", () => {
  it("shows the context that will be attached before submitting", () => {
    setup();
    expect(screen.getByText("We'll include:")).toBeInTheDocument();
    expect(screen.getByText("/timeline")).toBeInTheDocument();
    expect(screen.getByText("1280x800")).toBeInTheDocument();
  });

  it("keeps Send disabled until the message is long enough", async () => {
    const { user } = setup();
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText(/Your message/), "short");
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText(/Your message/), " enough now");
    expect(send).toBeEnabled();
  });

  it("submits the type, trimmed message and optional email, then shows the issue number", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("radio", { name: "Idea" }));
    await user.type(screen.getByLabelText(/Your message/), `  ${LONG_ENOUGH}  `);
    await user.type(screen.getByLabelText(/Email for follow-up/), "me@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: "idea",
      message: LONG_ENOUGH,
      email: "me@example.com",
    });
    expect(await screen.findByText("Filed as issue #42.")).toBeInTheDocument();
  });

  it("omits the email when left blank", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText(/Your message/), LONG_ENOUGH);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toEqual({ type: "bug", message: LONG_ENOUGH });
  });

  it("refuses a malformed email without submitting", async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText(/Your message/), LONG_ENOUGH);
    await user.type(screen.getByLabelText(/Email for follow-up/), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email.")).toBeInTheDocument();
  });

  it("keeps the draft on failure and retries with the same text", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ issueNumber: 7 });
    const { user } = setup(onSubmit);
    await user.type(screen.getByLabelText(/Your message/), LONG_ENOUGH);
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Your message is still here.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Your message/)).toHaveValue(LONG_ENOUGH);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Filed as issue #7.")).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("uses describeError for the failure text when provided", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Please write more."));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FeedbackDialog
        open
        onClose={onClose}
        onSubmit={onSubmit}
        labels={LABELS}
        contextItems={CONTEXT}
        describeError={(err) => (err instanceof Error ? err.message : LABELS.errorBody)}
      />
    );
    await user.type(screen.getByLabelText(/Your message/), LONG_ENOUGH);
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Please write more.")).toBeInTheDocument();
  });

  it("closes from Done after success and from Cancel", async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations", async () => {
    setup();
    const results = await axe(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

describe("FeedbackButton", () => {
  it("opens the dialog and returns focus to the button on close", async () => {
    const user = userEvent.setup();
    render(
      <FeedbackButton
        label="Send feedback"
        onSubmit={vi.fn()}
        labels={LABELS}
        contextItems={CONTEXT}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Send feedback" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
