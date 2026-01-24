import { Outlet } from "react-router-dom";
import { Header, type HeaderProps } from "./Header.js";
import { Sidebar, type SidebarProps } from "./Sidebar.js";
import type { ReactNode } from "react";

export interface AppLayoutProps {
  /** Header props */
  header?: HeaderProps;
  /** Sidebar props (if undefined, no sidebar is shown) */
  sidebar?: SidebarProps;
  /** Content to render (if not using Outlet) */
  children?: ReactNode;
}

/**
 * Standard app layout with header and optional sidebar
 */
export function AppLayout({ header, sidebar, children }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header {...header} />

      <div className="flex-1 flex">
        {sidebar && <Sidebar {...sidebar} />}

        <main className="flex-1 overflow-auto">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
