/**
 * The remote's own label catalogs, so a relabel ships with the remote and not with hospitality.
 * en-GB is spelled out in full (today it falls through to en-US in hospitality, with the same text).
 */

export const SIDENAV_LOCALES = ["en-US", "en-GB", "es-MX", "fr-CA"] as const;
export type SideNavLocale = (typeof SIDENAV_LOCALES)[number];

const EN = {
  "nav.label": "Dashboard navigation",
  "nav.sections.account": "Account",
  "nav.sections.admin": "Admin",
  "nav.sections.getStarted": "Get Started",
  "nav.sections.manage": "Manage",
  "nav.sections.tools": "Tools",
  "nav.items.profile": "Profile",
  "nav.items.settings": "Settings",
  "nav.items.users": "Users",
  "nav.items.tonightsService": "Tonight's Service",
  "nav.items.timeline": "Timeline",
  "nav.items.reservations": "Reservations",
  "nav.items.waitlist": "Waitlist",
  "nav.items.guests": "Guests",
  "nav.items.dashboard": "Dashboard",
  "nav.items.venueSetup": "Availability map",
  "nav.items.bookingWidget": "Booking Widget",
  "nav.items.signOut": "Sign Out",
  "nav.items.chat": "Chat",
  "nav.items.menus": "Menus",
  "nav.items.availability": "Availability",
  "setup.count": "{{done}} of {{total}}",
} as const;

export type CatalogKey = keyof typeof EN;
type Catalog = Readonly<Record<CatalogKey, string>>;

const ES_MX: Catalog = {
  "nav.label": "Navegación del panel",
  "nav.sections.account": "Cuenta",
  "nav.sections.admin": "Administración",
  "nav.sections.getStarted": "Primeros pasos",
  "nav.sections.manage": "Gestionar",
  "nav.sections.tools": "Herramientas",
  "nav.items.profile": "Perfil",
  "nav.items.settings": "Configuración",
  "nav.items.users": "Usuarios",
  "nav.items.tonightsService": "Servicio de esta noche",
  "nav.items.timeline": "Cronología",
  "nav.items.reservations": "Reservas",
  "nav.items.waitlist": "Lista de espera",
  "nav.items.guests": "Clientes",
  "nav.items.dashboard": "Panel",
  "nav.items.venueSetup": "Mapa de disponibilidad",
  "nav.items.bookingWidget": "Widget de reservas",
  "nav.items.signOut": "Cerrar sesión",
  "nav.items.chat": "Chat",
  "nav.items.menus": "Menús",
  "nav.items.availability": "Disponibilidad",
  "setup.count": "{{done}} de {{total}}",
};

const FR_CA: Catalog = {
  "nav.label": "Navigation du tableau de bord",
  "nav.sections.account": "Compte",
  "nav.sections.admin": "Administration",
  "nav.sections.getStarted": "Pour commencer",
  "nav.sections.manage": "Gérer",
  "nav.sections.tools": "Outils",
  "nav.items.profile": "Profil",
  "nav.items.settings": "Paramètres",
  "nav.items.users": "Utilisateurs",
  "nav.items.tonightsService": "Service de ce soir",
  "nav.items.timeline": "Chronologie",
  "nav.items.reservations": "Réservations",
  "nav.items.waitlist": "Liste d'attente",
  "nav.items.guests": "Clients",
  "nav.items.dashboard": "Tableau de bord",
  "nav.items.venueSetup": "Carte des disponibilités",
  "nav.items.bookingWidget": "Widget de réservation",
  "nav.items.signOut": "Se déconnecter",
  "nav.items.chat": "Clavardage",
  "nav.items.menus": "Menus",
  "nav.items.availability": "Disponibilité",
  "setup.count": "{{done}} sur {{total}}",
};

export const CATALOGS: Readonly<Record<SideNavLocale, Catalog>> = {
  "en-US": EN,
  "en-GB": EN,
  "es-MX": ES_MX,
  "fr-CA": FR_CA,
};

export function resolveLocale(locale: string): SideNavLocale {
  return SIDENAV_LOCALES.find((known) => known === locale) ?? "en-US";
}

export function translate(
  locale: string,
  key: CatalogKey,
  params: Readonly<Record<string, string | number>> = {}
): string {
  return CATALOGS[resolveLocale(locale)][key].replace(
    /\{\{(\w+)\}\}/g,
    (placeholder, name: string) => (name in params ? String(params[name]) : placeholder)
  );
}
