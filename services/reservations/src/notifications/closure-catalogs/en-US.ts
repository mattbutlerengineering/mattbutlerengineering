import type { ClosureCatalog } from "./types.js";

export const enUS: ClosureCatalog = {
  locale: "en-US",
  intl: "en-US",
  shortDate: (p) => `${p.weekday} ${p.month} ${p.day}`,
  emailDate: (p) => `${p.weekday}, ${p.month} ${p.day}`,
  offerDay: (p) => `${p.weekday} ${p.day}`,
  clock: (hour, minute) => {
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
  },
  previewLink: "[the guest's own link]",
  sms: {
    cancelled: (f) =>
      `${f.venue} is closed ${f.date}. Your ${f.time} table for ${f.party} is cancelled.${
        f.refund ? ` ${f.refund} deposit will be refunded.` : ""
      }`,
    rebookNone: (url) => ` Rebook: ${url}`,
    rebookOne: (offer) => ` Rebook ${offer}`,
    rebookMany: (offers, url) =>
      ` Rebook in one tap:\n${[...offers, `Other times ${url}`].join("\n")}`,
    moved: (f) =>
      `${f.venue} has changed its hours on ${f.date}. Your table for ${f.party} is now at ${f.time}. Can't make it? Cancel free: ${f.url}`,
    kept: (f) =>
      `${f.venue} has changed its hours on ${f.date}${f.note ? `: ${f.note}` : ""}. Your ${f.time} table is still booked. Manage: ${f.url}`,
    reopened: (f) => `We've reopened ${f.date} at ${f.venue}. Rebook: ${f.url}`,
  },
  email: {
    subject: {
      cancelled: (venue, date) => `Your reservation at ${venue} on ${date} is cancelled`,
      moved: (venue, date) => `Your reservation at ${venue} on ${date} has moved`,
      kept: (venue, date) => `Update about your reservation at ${venue} on ${date}`,
      reopened: (venue, date) => `${venue} has reopened on ${date}`,
    },
    hello: (name) => `Hi ${name},`,
    cancelled: {
      title: "Your reservation is cancelled",
      body: (f) =>
        `${f.venue} is closed on ${f.date}. Your ${f.time} table for ${f.party} is cancelled.`,
      refund: (amount) => `Your ${amount} deposit will be refunded.`,
      offer: (label) => `Rebook ${label}`,
      other: "Other dates and times",
    },
    moved: {
      title: "Your reservation has moved",
      body: (f) =>
        `${f.venue} has changed its hours on ${f.date}. Your table for ${f.party} is now at ${f.time}.`,
      cancel: (link) => `Can't make it? ${link("Cancel free")}`,
    },
    kept: {
      title: "Your reservation is still on",
      body: (f) =>
        `${f.venue} has changed its hours on ${f.date}. Your ${f.time} table is still booked.`,
      manage: "Manage your reservation",
    },
    reopened: {
      title: "We've reopened",
      body: (venue, date) => `${venue} has reopened on ${date}.`,
      rebook: "Rebook",
    },
  },
};
