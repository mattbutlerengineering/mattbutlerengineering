import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CookieBanner, CookiePreferencesDialog } from "./CookieConsent.js";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: any) => <div>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <div>{children}</div>,
  useReducedMotion: () => false,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Banner: ({ action }: any) => <div data-testid="banner">{action}</div>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Dialog: ({ open, onClose, title, footer, children }: any) => open ? (
    <div data-testid="dialog">
      <h2>{title}</h2>
      <button onClick={onClose}>Close</button>
      {children}
      <div>{footer}</div>
    </div>
  ) : null,
  Text: ({ children }: any) => <p>{children}</p>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Divider: () => <hr />,
  Toggle: ({ checked, onCheckedChange }: any) => <input type="checkbox" checked={checked} onChange={() => onCheckedChange(!checked)} data-testid="toggle" />,
}));

vi.mock("@mattbutlerengineering/rialto/motion", () => ({
  precision: { transition: {} },
  boop: { scale: 1.1 },
  springGentle: {},
  spring: {},
}));

describe("CookieBanner", () => {
  it("renders nothing if cookies are accepted", () => {
    render(
      <MemoryRouter>
        <CookieBanner consented={true} onAcceptAll={vi.fn()} onRejectAll={vi.fn()} onCustomize={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("banner")).toBeNull();
  });

  it("renders banner if not consented", () => {
    const acceptAll = vi.fn();

    render(
      <MemoryRouter>
        <CookieBanner consented={false} onAcceptAll={acceptAll} onRejectAll={vi.fn()} onCustomize={vi.fn()} />
      </MemoryRouter>
    );
    
    const acceptBtn = screen.getByText("Accept All");
    expect(acceptBtn).toBeInTheDocument();
    fireEvent.click(acceptBtn);
    expect(acceptAll).toHaveBeenCalled();
  });
});

describe("CookiePreferencesDialog", () => {
  it("renders the dialog", () => {
    const onSave = vi.fn();
    render(
      <CookiePreferencesDialog 
        open={true} 
        onClose={vi.fn()} 
        preferences={{ essential: true, functional: false, analytics: false, marketing: false }}
        onSave={onSave}
        onRejectAll={vi.fn()}
      />
    );

    expect(screen.getByText("Cookie Preferences")).toBeInTheDocument();
    const saveBtn = screen.getByText("Save Preferences");
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalled();
  });
});
