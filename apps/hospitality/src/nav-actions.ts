/**
 * What selecting a nav item does. Replaces the old sentinel paths ("/__chat__",
 * "/__signout__") that each surface had to intercept on its own — a surface that
 * forgot (the command palette) navigated to a route that does not exist.
 */
export type NavAction =
  | { readonly type: "route"; readonly path: string }
  | { readonly type: "chat" }
  | { readonly type: "signout" };

export interface NavActionHandlers {
  navigate: (path: string) => void;
  toggleChat: () => void;
  signOut: () => void;
}

/** The single resolver shared by the sidebar and the command palette. */
export function runNavAction(action: NavAction, handlers: NavActionHandlers): void {
  switch (action.type) {
    case "route":
      handlers.navigate(action.path);
      return;
    case "chat":
      handlers.toggleChat();
      return;
    case "signout":
      handlers.signOut();
      return;
  }
}
