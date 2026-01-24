import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Page description */
  description?: string;
  /** Actions (buttons, etc.) */
  actions?: ReactNode;
}

/**
 * Standard page header with title, description, and actions
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="border-b bg-white">
      <div className="px-6 py-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
