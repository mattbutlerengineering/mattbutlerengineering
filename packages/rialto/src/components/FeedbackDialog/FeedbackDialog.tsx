import { useId, useState, type FormEvent } from "react";
import { Dialog } from "../Dialog/Dialog";
import { Button } from "../Button/Button";
import { Input } from "../Input/Input";
import { TextArea } from "../TextArea/TextArea";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import { Text } from "../Text/Text";
import styles from "./FeedbackDialog.module.css";

export type FeedbackKind = "bug" | "idea" | "other";

const FEEDBACK_MESSAGE_MIN = 10;
const FEEDBACK_MESSAGE_MAX = 2000;

const KINDS: readonly FeedbackKind[] = ["bug", "idea", "other"];
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the reporter typed. `email` is absent when the field was left blank. */
export interface FeedbackDraft {
  type: FeedbackKind;
  message: string;
  email?: string;
}

/** A line of the "We'll include" list, e.g. `{ label: "Page", value: "/timeline" }`. */
export interface FeedbackContextItem {
  label: string;
  value: string;
}

/** Every string the dialog shows. The consumer owns the copy (and its locales). */
export interface FeedbackDialogLabels {
  title: string;
  typeLabel: string;
  types: Record<FeedbackKind, string>;
  messageLabel: string;
  messageHint: string;
  messageTooShort: string;
  emailLabel: string;
  emailHint: string;
  emailInvalid: string;
  contextHeading: string;
  submit: string;
  submitting: string;
  cancel: string;
  done: string;
  retry: string;
  errorTitle: string;
  errorBody: string;
  successTitle: string;
  successBody: (issueNumber: number) => string;
}

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  /** Files the feedback. Reject to show the error state; the draft is kept. */
  onSubmit: (draft: FeedbackDraft) => Promise<{ issueNumber: number }>;
  labels: FeedbackDialogLabels;
  /** Auto-attached context, shown to the reporter before they send. */
  contextItems: readonly FeedbackContextItem[];
  /** Friendly failure text for a rejected submit; defaults to `labels.errorBody`. */
  describeError?: (error: unknown) => string;
}

type Phase =
  | { readonly name: "editing" }
  | { readonly name: "sending" }
  | { readonly name: "failed"; readonly detail: string }
  | { readonly name: "sent"; readonly issueNumber: number };

const EDITING: Phase = { name: "editing" };

/**
 * Modal for reporting a bug or idea. Collects a type, a message (10–2000
 * characters) and an optional email, lists the context that will be attached,
 * and reports the filed issue number. A failed submit keeps the draft and
 * offers a retry.
 *
 * @example
 * <FeedbackDialog open={open} onClose={close} onSubmit={file} labels={labels} contextItems={items} />
 */
export function FeedbackDialog({
  open,
  onClose,
  onSubmit,
  labels,
  contextItems,
  describeError,
}: FeedbackDialogProps) {
  const formId = useId();
  const [type, setType] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>(EDITING);
  const [emailError, setEmailError] = useState(false);

  const trimmed = message.trim();
  const canSend = trimmed.length >= FEEDBACK_MESSAGE_MIN && trimmed.length <= FEEDBACK_MESSAGE_MAX;
  const busy = phase.name === "sending";

  const handleClose = () => {
    if (busy) return;
    if (phase.name === "sent") {
      setMessage("");
      setEmail("");
      setType("bug");
    }
    setPhase(EDITING);
    setEmailError(false);
    onClose();
  };

  const send = async () => {
    const address = email.trim();
    if (address && !EMAIL_SHAPE.test(address)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setPhase({ name: "sending" });
    try {
      const { issueNumber } = await onSubmit({
        type,
        message: trimmed,
        ...(address ? { email: address } : {}),
      });
      setPhase({ name: "sent", issueNumber });
    } catch (error) {
      setPhase({ name: "failed", detail: describeError?.(error) ?? labels.errorBody });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend && !busy) void send();
  };

  if (phase.name === "sent") {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title={labels.successTitle}
        description={labels.successBody(phase.issueNumber)}
        footer={<Button onClick={handleClose}>{labels.done}</Button>}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={labels.title}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={busy}>
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={!canSend}
            isLoading={busy}
            loadingText={labels.submitting}
          >
            {phase.name === "failed" ? labels.retry : labels.submit}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
        <SegmentedControl
          aria-label={labels.typeLabel}
          segments={KINDS.map((id) => ({ id, label: labels.types[id] }))}
          value={type}
          onChange={(id) => setType(id as FeedbackKind)}
        />
        <TextArea
          label={labels.messageLabel}
          hint={trimmed.length > 0 && !canSend ? labels.messageTooShort : labels.messageHint}
          error={trimmed.length > 0 && trimmed.length < FEEDBACK_MESSAGE_MIN}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={busy}
          required
        />
        <Input
          label={labels.emailLabel}
          hint={emailError ? labels.emailInvalid : labels.emailHint}
          error={emailError}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
          showOptional
        />
        <section className={styles.context} aria-label={labels.contextHeading}>
          <Text variant="label">{labels.contextHeading}</Text>
          <dl className={styles.contextList}>
            {contextItems.map((item) => (
              <div key={item.label} className={styles.contextRow}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {phase.name === "failed" && (
          <div role="alert" className={styles.error}>
            <Text variant="label">{labels.errorTitle}</Text>
            <Text variant="caption">{phase.detail}</Text>
          </div>
        )}
      </form>
    </Dialog>
  );
}
