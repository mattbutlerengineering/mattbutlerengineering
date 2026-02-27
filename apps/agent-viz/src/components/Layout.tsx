import type { ReactNode } from "react";

interface LayoutProps {
  readonly header: ReactNode;
  readonly sidebar: ReactNode;
  readonly main: ReactNode;
  readonly detail: ReactNode;
  readonly detailOpen: boolean;
}

export function Layout({ header, sidebar, main, detail, detailOpen }: LayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      {header}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-700/50">
          {sidebar}
        </aside>

        {/* Graph */}
        <main className="flex-1 overflow-hidden">{main}</main>

        {/* Detail panel */}
        {detailOpen && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-700/50">
            {detail}
          </aside>
        )}
      </div>
    </div>
  );
}
