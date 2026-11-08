import type { ClosureCatalog } from "./types.js";

export const frCA: ClosureCatalog = {
  locale: "fr-CA",
  intl: "fr-CA",
  shortDate: (p) => `${p.weekday} ${p.day} ${p.month}`,
  emailDate: (p) => `${p.weekday} ${p.day} ${p.month}`,
  offerDay: (p) => `${p.weekday} ${p.day}`,
  clock: (hour, minute) => `${hour} h ${String(minute).padStart(2, "0")}`,
  previewLink: "[le lien propre au client]",
  sms: {
    cancelled: (f) =>
      `${f.venue} sera fermé le ${f.date}. Votre table de ${f.time} pour ${f.party} est annulée.${
        f.refund ? ` Votre dépôt de ${f.refund} sera remboursé.` : ""
      }`,
    rebookNone: (url) => ` Réservez à nouveau : ${url}`,
    rebookOne: (offer) => ` Réservez à nouveau ${offer}`,
    rebookMany: (offers, url) =>
      ` Réservez à nouveau d'un clic :\n${[...offers, `Autres heures ${url}`].join("\n")}`,
    moved: (f) =>
      `${f.venue} a modifié ses heures le ${f.date}. Votre table pour ${f.party} est maintenant à ${f.time}. Un empêchement? Annulez sans frais : ${f.url}`,
    kept: (f) =>
      `${f.venue} a modifié ses heures le ${f.date}${f.note ? ` : ${f.note}` : ""}. Votre table de ${f.time} est toujours réservée. Gérez : ${f.url}`,
    reopened: (f) =>
      `Nous avons rouvert le ${f.date} chez ${f.venue}. Réservez à nouveau : ${f.url}`,
  },
  email: {
    subject: {
      cancelled: (venue, date) => `Votre réservation chez ${venue} le ${date} est annulée`,
      moved: (venue, date) => `Votre réservation chez ${venue} le ${date} a été déplacée`,
      kept: (venue, date) => `Mise à jour de votre réservation chez ${venue} le ${date}`,
      reopened: (venue, date) => `${venue} a rouvert le ${date}`,
    },
    hello: (name) => `Bonjour ${name},`,
    cancelled: {
      title: "Votre réservation est annulée",
      body: (f) =>
        `${f.venue} sera fermé le ${f.date}. Votre table de ${f.time} pour ${f.party} est annulée.`,
      refund: (amount) => `Votre dépôt de ${amount} sera remboursé.`,
      offer: (label) => `Réservez à nouveau ${label}`,
      other: "Autres dates et heures",
    },
    moved: {
      title: "Votre réservation a été déplacée",
      body: (f) =>
        `${f.venue} a modifié ses heures le ${f.date}. Votre table pour ${f.party} est maintenant à ${f.time}.`,
      cancel: (link) => `Un empêchement? ${link("Annulez sans frais")}`,
    },
    kept: {
      title: "Votre réservation est maintenue",
      body: (f) =>
        `${f.venue} a modifié ses heures le ${f.date}. Votre table de ${f.time} est toujours réservée.`,
      manage: "Gérer votre réservation",
    },
    reopened: {
      title: "Nous avons rouvert",
      body: (venue, date) => `${venue} a rouvert le ${date}.`,
      rebook: "Réservez à nouveau",
    },
  },
};
