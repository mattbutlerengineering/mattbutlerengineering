import { buildClosureEmail, buildClosureSms, type ClosureNoticeKind } from "./closure-content.js";
import { buildManageUrl } from "./manage-url.js";

/**
 * What a guest would be sent for one closure outcome (docs/features/venue-availability/ux.md S7,
 * "Preview message"): the same `buildClosureEmail` / `buildClosureSms` the CLOSURE_NOTICE job calls,
 * with the email body as the plain text a guest reads. Nothing is worded here.
 */

export type PreviewAction = "cancel" | "move" | "keep_notify";

const KIND_OF_ACTION: Record<PreviewAction, ClosureNoticeKind> = {
  cancel: "cancelled",
  move: "moved",
  keep_notify: "kept",
};

/** Stands in for the guest's own signed token, which only exists when a notice is really sent. */
const PREVIEW_TOKEN = "preview";

export interface ClosurePreviewInput {
  action: PreviewAction;
  venueName: string;
  timezone: string;
  /** Venue-local service date the closure affects, "YYYY-MM-DD". */
  closureDate: string;
  /** The booking's start as the notice states it: the new time, for a move. */
  startTime: string;
  partySize: number;
  guestName: string | null;
  message: string | null;
  refund: { amountCents: number; currency: string } | null;
  manageBaseUrl: string;
}

export interface ClosurePreview {
  email: { subject: string; text: string };
  sms: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** The email body as read: one line per paragraph, tags dropped, entities decoded (link text kept). */
function emailText(html: string): string {
  return html
    .split("\n")
    .map((line) =>
      line.replace(/<[^>]+>/g, "").replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]!)
    )
    .filter((line) => line.trim() !== "")
    .join("\n");
}

export function previewClosureNotice(input: ClosurePreviewInput): ClosurePreview {
  const content = {
    kind: KIND_OF_ACTION[input.action],
    venueName: input.venueName,
    guestName: input.guestName,
    closureDate: input.closureDate,
    startTime: input.startTime,
    timezone: input.timezone,
    partySize: input.partySize,
    message: input.message?.trim() ? input.message.trim() : null,
    refund: input.action === "cancel" ? input.refund : null,
    manageUrl: buildManageUrl(input.manageBaseUrl, PREVIEW_TOKEN),
    // Open rebook times are looked up when the notice is sent, so they are still open then.
    offers: [],
  };
  const { subject, html } = buildClosureEmail(content);
  return { email: { subject, text: emailText(html) }, sms: buildClosureSms(content) };
}
