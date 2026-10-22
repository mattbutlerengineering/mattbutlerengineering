import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useOptionalVenue } from "../contexts/venue-context-object.js";
import { parseVenueTheme, themeToCssVars } from "../lib/venue-theme.js";

/**
 * Applies the selected venue's palette by overriding rialto's colour custom properties on a
 * layout-neutral wrapper. Derived at render time; no palette or an unreadable one leaves stock.
 */
export function VenueThemeProvider({ children }: { readonly children: ReactNode }) {
  const settings = useOptionalVenue()?.selectedVenue?.settings;
  const style = useMemo(() => {
    const theme = parseVenueTheme(settings);
    return theme ? (themeToCssVars(theme) as CSSProperties) : undefined;
  }, [settings]);
  return <div style={{ display: "contents", ...style }}>{children}</div>;
}
