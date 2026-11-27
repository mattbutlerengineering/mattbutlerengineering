import { useCurrentUser } from "../hooks/useUsers.js";
import { useThemeServerHydration } from "../hooks/use-theme";

/**
 * Hydrates the local theme from the server-saved preference once the current
 * user resolves — see `useThemeServerHydration`. Renders nothing; only
 * mounted once a user is authenticated, so `/users/me` is never fetched
 * ahead of a token. Lives in its own file so App.tsx can lazy-load it: the
 * venue/query hooks stay off the public landing's first load (#9976).
 */
export function ThemeServerSync() {
  const { data: user } = useCurrentUser();
  useThemeServerHydration(user?.preferences.theme);
  return null;
}
