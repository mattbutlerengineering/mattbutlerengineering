import { useState } from "react";
import { Button, type ButtonProps } from "../Button/Button";
import { FeedbackDialog, type FeedbackDialogProps } from "./FeedbackDialog";

export interface FeedbackButtonProps extends Omit<FeedbackDialogProps, "open" | "onClose"> {
  /** Visible name of the trigger, e.g. "Send feedback". */
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}

/**
 * A button that opens a {@link FeedbackDialog}. Focus returns to the button
 * when the dialog closes.
 *
 * @example
 * <FeedbackButton label="Send feedback" onSubmit={file} labels={labels} contextItems={items} />
 */
export function FeedbackButton({ label, variant = "ghost", size, ...dialog }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <FeedbackDialog {...dialog} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
