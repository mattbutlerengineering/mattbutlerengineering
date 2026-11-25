import type { Meta, StoryObj } from "@storybook/react-vite";
import { FeedbackButton } from "./FeedbackButton";
import type { FeedbackDialogLabels } from "./FeedbackDialog";

const LABELS: FeedbackDialogLabels = {
  title: "Send feedback",
  typeLabel: "What kind of feedback is this?",
  types: { bug: "Bug", idea: "Idea", other: "Other" },
  messageLabel: "Your message",
  messageHint: "At least 10 characters.",
  messageTooShort: "Write at least 10 characters.",
  emailLabel: "Email for follow-up",
  emailHint: "Optional. It is never posted publicly.",
  emailInvalid: "Enter a valid email address.",
  contextHeading: "We'll include:",
  submit: "Send",
  submitting: "Sending",
  cancel: "Cancel",
  done: "Done",
  retry: "Try again",
  errorTitle: "We couldn't send your feedback",
  errorBody: "Your message is still here. Check your connection and try again.",
  successTitle: "Thanks, we got it",
  successBody: (issueNumber) => `Filed as issue #${issueNumber}.`,
};

const CONTEXT = [
  { label: "App", value: "hospitality" },
  { label: "Page", value: "/timeline" },
  { label: "Screen", value: "1280x800" },
];

const meta: Meta<typeof FeedbackButton> = {
  title: "Overlay/FeedbackDialog",
  component: FeedbackButton,
  tags: ["autodocs"],
  args: {
    label: "Send feedback",
    labels: LABELS,
    contextItems: CONTEXT,
  },
};

export default meta;
type Story = StoryObj<typeof FeedbackButton>;

export const Success: Story = {
  args: { onSubmit: async () => ({ issueNumber: 1234 }) },
};

export const Failure: Story = {
  args: {
    onSubmit: async () => {
      throw new Error("offline");
    },
  },
};
