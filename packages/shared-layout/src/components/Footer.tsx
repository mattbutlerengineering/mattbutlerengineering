import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export interface FooterProps {
  /** Company/brand name */
  brandName?: string;
  /** Footer sections with links */
  sections?: FooterSection[];
  /** Bottom row content (e.g., social links) */
  bottom?: ReactNode;
}

export function Footer({ brandName = "Matt Butler Engineering", sections, bottom }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-gray-50">
      <div className="container mx-auto px-4 py-12">
        {sections && sections.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="font-semibold mb-3">{section.title}</h3>
                <ul className="space-y-2">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-600 hover:text-gray-900"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          to={link.href}
                          className="text-sm text-gray-600 hover:text-gray-900"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t">
          <p className="text-sm text-gray-500">
            &copy; {currentYear} {brandName}. All rights reserved.
          </p>
          {bottom}
        </div>
      </div>
    </footer>
  );
}
