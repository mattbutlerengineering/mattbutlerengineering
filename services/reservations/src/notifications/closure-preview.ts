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

/** Stands where the guest's own link goes: it is made, signed, only when a notice is sent. */
export const PREVIEW_LINK_TEXT = "[the guest's own link]";

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
  /** The booking's origin host brand: where the link points. */
  manageBaseUrl: string;
  /**
   * A token as long as a real signed one. `buildClosureSms` picks its body by segment count, so a
   * short stand-in would keep a venue message the real, longer link makes it drop.
   */
  manageToken: string;
  /** The sender, display name included, as the guest's mail client shows it. */
  from: string;
}

export interface ClosurePreview {
  email: { from: string; subject: string; text: string };
  sms: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** The text outside every `<...>` tag. Content is escaped, so a `<` in it is always a tag's. */
function withoutTags(line: string): string {
  let text = "";
  let inTag = false;
  for (const ch of line) {
    if (ch === "<") inTag = true;
    else if (ch === ">" && inTag) inTag = false;
    else if (!inTag) text += ch;
  }
  return text;
}

/** The email body as read: one line per paragraph, tags dropped, entities decoded once (link text kept). */
function emailText(html: string): string {
  return html
    .split("\n")
    .map((line) => withoutTags(line).replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e))
    .filter((line) => line.trim() !== "")
    .join("\n");
}

export function previewClosureNotice(input: ClosurePreviewInput): ClosurePreview {
  const manageUrl = buildManageUrl(input.manageBaseUrl, input.manageToken);
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
    manageUrl,
    // Open rebook times are looked up when the notice is sent, so they are still open then.
    offers: [],
  };
  const { subject, html } = buildClosureEmail(content);
  return {
    email: { from: input.from, subject, text: emailText(html) },
    sms: buildClosureSms(content).split(manageUrl).join(PREVIEW_LINK_TEXT),
  };
}
