import { Outlet, Link } from "react-router-dom";
import { Button } from "@mbe/ui";

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold">
            Matt Butler Engineering
          </Link>
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-sm hover:underline">
              Dashboard
            </a>
            <Button size="sm">Sign In</Button>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="container mx-auto px-4 py-8">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Matt Butler Engineering. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
