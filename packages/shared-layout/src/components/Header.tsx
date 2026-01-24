import { Link } from "react-router-dom";
import { Button } from "@mbe/ui";
import type { ReactNode } from "react";

export interface HeaderProps {
  /** Logo or brand element */
  logo?: ReactNode;
  /** Navigation links */
  nav?: ReactNode;
  /** Right side actions (e.g., user menu, sign in) */
  actions?: ReactNode;
  /** Whether user is authenticated */
  isAuthenticated?: boolean;
  /** User info for display */
  user?: {
    name?: string | null;
    picture?: string | null;
  };
  /** Sign in handler */
  onSignIn?: () => void;
  /** Sign out handler */
  onSignOut?: () => void;
}

export function Header({
  logo,
  nav,
  actions,
  isAuthenticated,
  user,
  onSignIn,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="border-b bg-white">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-8">
          {logo ?? (
            <Link to="/" className="text-xl font-bold">
              MBE
            </Link>
          )}
          {nav && <nav className="hidden md:flex items-center gap-6">{nav}</nav>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {actions}
          {!actions && isAuthenticated && user && (
            <div className="flex items-center gap-3">
              {user.picture && (
                <img
                  src={user.picture}
                  alt={user.name ?? "User"}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm hidden sm:inline">{user.name}</span>
              <Button variant="outline" size="sm" onClick={onSignOut}>
                Sign Out
              </Button>
            </div>
          )}
          {!actions && !isAuthenticated && (
            <Button size="sm" onClick={onSignIn}>
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
