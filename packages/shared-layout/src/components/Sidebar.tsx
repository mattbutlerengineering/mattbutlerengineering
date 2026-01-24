import { Link, useLocation } from "react-router-dom";
import { cn } from "@mbe/ui";
import type { ReactNode } from "react";

export interface SidebarItem {
  label: string;
  href: string;
  icon?: ReactNode;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

export interface SidebarProps {
  /** Sidebar sections */
  sections: SidebarSection[];
  /** Header content (above navigation) */
  header?: ReactNode;
  /** Footer content (below navigation) */
  footer?: ReactNode;
  /** Additional className */
  className?: string;
}

export function Sidebar({ sections, header, footer, className }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "w-64 border-r bg-gray-50 flex flex-col h-full",
        className
      )}
    >
      {header && <div className="p-4 border-b">{header}</div>}

      <nav className="flex-1 overflow-y-auto p-4">
        {sections.map((section, index) => (
          <div key={index} className={cn(index > 0 && "mt-6")}>
            {section.title && (
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
                {section.title}
              </h3>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-gray-200 text-gray-900 font-medium"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      )}
                    >
                      {item.icon && (
                        <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
                      )}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {footer && <div className="p-4 border-t">{footer}</div>}
    </aside>
  );
}
