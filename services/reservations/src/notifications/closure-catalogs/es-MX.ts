import type { ClosureCatalog } from "./types.js";

export const esMX: ClosureCatalog = {
  locale: "es-MX",
  intl: "es-MX",
  shortDate: (p) => `${p.weekday} ${p.day} ${p.month}`,
  emailDate: (p) => `${p.weekday} ${p.day} ${p.month}`,
  offerDay: (p) => `${p.weekday} ${p.day}`,
  clock: (hour, minute) => {
    const suffix = hour >= 12 ? "pm" : "am";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
  },
  previewLink: "[el enlace propio del huésped]",
  sms: {
    cancelled: (f) =>
      `${f.venue} estará cerrado el ${f.date}. Tu mesa de las ${f.time} para ${f.party} se canceló.${
        f.refund ? ` Se reembolsará tu depósito de ${f.refund}.` : ""
      }`,
    rebookNone: (url) => ` Reserva de nuevo: ${url}`,
    rebookOne: (offer) => ` Reserva de nuevo ${offer}`,
    rebookMany: (offers, url) =>
      ` Reserva de nuevo con un toque:\n${[...offers, `Otros horarios ${url}`].join("\n")}`,
    moved: (f) =>
      `${f.venue} cambió su horario el ${f.date}. Tu mesa para ${f.party} ahora es a las ${f.time}. ¿No puedes ir? Cancela gratis: ${f.url}`,
    kept: (f) =>
      `${f.venue} cambió su horario el ${f.date}${f.note ? `: ${f.note}` : ""}. Tu mesa de las ${f.time} sigue reservada. Administra: ${f.url}`,
    reopened: (f) => `Reabrimos el ${f.date} en ${f.venue}. Reserva de nuevo: ${f.url}`,
  },
  email: {
    subject: {
      cancelled: (venue, date) => `Se canceló tu reservación en ${venue} el ${date}`,
      moved: (venue, date) => `Tu reservación en ${venue} el ${date} cambió de horario`,
      kept: (venue, date) => `Novedades sobre tu reservación en ${venue} el ${date}`,
      reopened: (venue, date) => `${venue} reabrió el ${date}`,
    },
    hello: (name) => `Hola ${name}:`,
    cancelled: {
      title: "Se canceló tu reservación",
      body: (f) =>
        `${f.venue} estará cerrado el ${f.date}. Tu mesa de las ${f.time} para ${f.party} se canceló.`,
      refund: (amount) => `Se reembolsará tu depósito de ${amount}.`,
      offer: (label) => `Reserva de nuevo ${label}`,
      other: "Otras fechas y horarios",
    },
    moved: {
      title: "Tu reservación cambió de horario",
      body: (f) =>
        `${f.venue} cambió su horario el ${f.date}. Tu mesa para ${f.party} ahora es a las ${f.time}.`,
      cancel: (link) => `¿No puedes ir? ${link("Cancela gratis")}`,
    },
    kept: {
      title: "Tu reservación sigue en pie",
      body: (f) =>
        `${f.venue} cambió su horario el ${f.date}. Tu mesa de las ${f.time} sigue reservada.`,
      manage: "Administra tu reservación",
    },
    reopened: {
      title: "Reabrimos",
      body: (venue, date) => `${venue} reabrió el ${date}.`,
      rebook: "Reserva de nuevo",
    },
  },
};
