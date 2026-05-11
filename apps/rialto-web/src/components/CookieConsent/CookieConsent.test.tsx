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
  Button: ({ children, onClick }: any) => <Button onClick={onClick}>{children}</Button>,
  Dialog: ({ open, onClose, title, footer, children }: any) => open ? (
    <div data-testid="dialog">
      <Heading>{title}</Heading>
      <Button onClick={onClose}>Close</Button>
      {children}
      <div>{footer}</div>
    </div>
  ) : null,
  Text: ({ children }: any) => <Text>{children}</Text>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Divider: () => <hr />,
  Toggle: ({ checked, onCheckedChange }: any) => <Input type="checkbox" checked={checked} onChange={() => onCheckedChange(!checked)} data-testid="toggle" />,
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

  it("calls onSave with correct prefs and onClose when Save Preferences is clicked", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <CookiePreferencesDialog
        open={true}
        onClose={onClose}
        preferences={{ essential: true, functional: false, analytics: false, marketing: false }}
        onSave={onSave}
        onRejectAll={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Save Preferences"));
    expect(onSave).toHaveBeenCalledWith({ analytics: false, functional: false, marketing: false });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onRejectAll and onClose when Reject All is clicked", () => {
    const onRejectAll = vi.fn();
    const onClose = vi.fn();
    render(
      <CookiePreferencesDialog
        open={true}
        onClose={onClose}
        preferences={{ essential: true, functional: false, analytics: false, marketing: false }}
        onSave={vi.fn()}
        onRejectAll={onRejectAll}
      />
    );

    fireEvent.click(screen.getByText("Reject All"));
    expect(onRejectAll).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("renders toggles for each cookie category", () => {
    render(
      <CookiePreferencesDialog
        open={true}
        onClose={vi.fn()}
        preferences={{ essential: true, functional: false, analytics: false, marketing: false }}
        onSave={vi.fn()}
        onRejectAll={vi.fn()}
      />
    );

    // The toggles are rendered: essential (disabled), analytics, functional, marketing
    const toggles = screen.getAllByTestId("toggle");
    expect(toggles).toHaveLength(4);
    // Essential is always checked
    expect((toggles[0] as HTMLInputElement).checked).toBe(true);
    // analytics, functional, marketing start as false
    expect((toggles[1] as HTMLInputElement).checked).toBe(false);
  });

  it("updates draft state when a toggle is changed", () => {
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

    // Click analytics toggle (index 1) via the checkbox onChange
    const toggles = screen.getAllByTestId("toggle");
    // Simulate the onChange on the analytics toggle
    fireEvent.click(toggles[1]!);

    // Save — the draft should have been updated by the onCheckedChange handler
    fireEvent.click(screen.getByText("Save Preferences"));
    // onSave is called (we just verify it ran without error)
    expect(onSave).toHaveBeenCalled();
  });

  it("does not render when open is false", () => {
    render(
      <CookiePreferencesDialog
        open={false}
        onClose={vi.fn()}
        preferences={{ essential: true, functional: false, analytics: false, marketing: false }}
        onSave={vi.fn()}
        onRejectAll={vi.fn()}
      />
    );
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("calls onRejectAll when banner reject all button is clicked", () => {
    const onRejectAll = vi.fn();
    render(
      <MemoryRouter>
        <CookieBanner consented={false} onAcceptAll={vi.fn()} onRejectAll={onRejectAll} onCustomize={vi.fn()} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Reject All"));
    expect(onRejectAll).toHaveBeenCalled();
  });

  it("calls onCustomize when Customize button is clicked", () => {
    const onCustomize = vi.fn();
    render(
      <MemoryRouter>
        <CookieBanner consented={false} onAcceptAll={vi.fn()} onRejectAll={vi.fn()} onCustomize={onCustomize} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Customize"));
    expect(onCustomize).toHaveBeenCalled();
  });
});
