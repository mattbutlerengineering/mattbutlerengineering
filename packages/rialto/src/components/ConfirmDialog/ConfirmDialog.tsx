import { useRef, useEffect, forwardRef } from 'react';
import { Dialog } from '../Dialog/Dialog';
import styles from './ConfirmDialog.module.css';

function ConfirmIcon({ variant }: { variant: 'default' | 'destructive' }) {
  if (variant === 'destructive') {
    return (
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        stroke="var(--rialto-error)"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="24" cy="24" r="20" />
        <path d="M24 14v12M24 32v2" />
      </svg>
    );
  }
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      stroke="var(--rialto-accent)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="24" cy="24" r="20" />
      <path d="M16 24l6 6 12-12" />
    </svg>
  );
}

/**
 * A purpose-built confirmation dialog with confirm/cancel actions and an icon.
 * When `variant` is `"destructive"`, the cancel button receives initial focus
 * to prevent accidental confirmations.
 *
 * @example
 * <ConfirmDialog
 *   open={showConfirm}
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowConfirm(false)}
 *   title="Delete item?"
 *   variant="destructive"
 * />
 */
export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description?: string;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** "destructive" renders a red confirm button and focuses cancel by default */
  variant?: 'default' | 'destructive';
  className?: string;
}

export const ConfirmDialog = forwardRef<HTMLDivElement, ConfirmDialogProps>(
  function ConfirmDialog(
    {
      open,
      onConfirm,
      onCancel,
      title,
      description,
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      variant = 'default',
    },
    ref
  ) {
    const confirmRef = useRef<HTMLButtonElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    // Auto-focus: destructive → cancel, default → confirm
    useEffect(() => {
      if (!open) return;
      const timer = setTimeout(() => {
        if (variant === 'destructive') {
          cancelRef.current?.focus();
        } else {
          confirmRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }, [open, variant]);

    const confirmClass = [
      styles.button,
      styles.confirm,
      variant === 'destructive' ? styles.destructive : styles.default,
    ].join(' ');

    return (
      <Dialog
        ref={ref}
        open={open}
        onClose={onCancel}
        title={title}
        description={description}
        footer={
          <>
            <button
              ref={cancelRef}
              className={[styles.button, styles.cancel].join(' ')}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              className={confirmClass}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </>
        }
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 'var(--rialto-space-md)',
          }}
        >
          <ConfirmIcon variant={variant} />
        </div>
      </Dialog>
    );
  }
);

ConfirmDialog.displayName = 'ConfirmDialog';
