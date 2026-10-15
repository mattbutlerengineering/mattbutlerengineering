import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { RialtoLocaleProvider } from "../i18n/RialtoLocaleProvider";
import { esMX } from "../i18n/locales/es-MX";
import { Alert } from "./Alert/Alert";
import { Banner } from "./Banner/Banner";
import { ConfirmDialog } from "./ConfirmDialog/ConfirmDialog";
import { Dialog } from "./Dialog/Dialog";
import { Drawer } from "./Drawer/Drawer";
import { HoverCard } from "./HoverCard/HoverCard";
import { Popover } from "./Popover/Popover";
import { ToastProvider } from "./Toast/Toast";
import { ToastAnimated } from "./Toast/ToastAnimated";

const noop = () => {};
const toasts = [{ id: "t1", title: "Saved", variant: "success" as const }];
const trigger = <button type="button">go</button>;

interface Case {
  readonly name: string;
  readonly ui: () => ReactNode;
  /** [role, accessible name with no provider, accessible name under es-MX] */
  readonly checks: readonly (readonly [string, string, string])[];
}

const CASES: readonly Case[] = [
  {
    name: "Alert",
    ui: () => <Alert dismissible>x</Alert>,
    checks: [["button", "Dismiss", esMX.dismiss]],
  },
  {
    name: "Banner",
    ui: () => <Banner dismissible>x</Banner>,
    checks: [["button", "Dismiss", esMX.dismiss]],
  },
  {
    name: "ToastAnimated",
    ui: () => <ToastAnimated toasts={toasts} onDismiss={noop} />,
    checks: [["button", "Dismiss", esMX.dismiss]],
  },
  {
    name: "ToastProvider",
    ui: () => <ToastProvider>x</ToastProvider>,
    checks: [["region", "Notifications", esMX.notifications]],
  },
  {
    name: "Dialog",
    ui: () => <Dialog open onClose={noop} title="T" />,
    checks: [["button", "Close dialog", esMX.closeDialog]],
  },
  {
    name: "Dialog without title",
    ui: () => <Dialog open onClose={noop} />,
    checks: [["dialog", "Dialog", esMX.dialog]],
  },
  {
    name: "Drawer",
    ui: () => (
      <Drawer open onClose={noop} title="T">
        x
      </Drawer>
    ),
    checks: [["button", "Close", esMX.close]],
  },
  {
    name: "Drawer without title",
    ui: () => (
      <Drawer open onClose={noop}>
        x
      </Drawer>
    ),
    checks: [["dialog", "Drawer", esMX.drawer]],
  },
  {
    name: "Popover",
    ui: () => (
      <Popover open title="T" trigger={trigger}>
        x
      </Popover>
    ),
    checks: [["button", "Close", esMX.close]],
  },
  {
    name: "Popover without title",
    ui: () => (
      <Popover open trigger={trigger}>
        x
      </Popover>
    ),
    checks: [["dialog", "Popover", esMX.popover]],
  },
  {
    name: "ConfirmDialog defaults",
    ui: () => <ConfirmDialog open onConfirm={noop} onCancel={noop} title="T" />,
    checks: [
      ["button", "Confirm", esMX.confirm],
      ["button", "Cancel", esMX.cancel],
    ],
  },
];

describe("overlay components localize their built-in text (ADR-028)", () => {
  it.each(CASES)("$name renders English with no provider", ({ ui, checks }) => {
    render(<>{ui()}</>);
    for (const [role, name] of checks) {
      expect(screen.getByRole(role, { name })).toBeInTheDocument();
    }
  });

  it.each(CASES)("$name renders es-MX under a provider", ({ ui, checks }) => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        {ui()}
      </RialtoLocaleProvider>
    );
    for (const [role, , name] of checks) {
      expect(screen.getByRole(role, { name })).toBeInTheDocument();
    }
  });

  it("HoverCard preview is English with no provider and es-MX under one", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <HoverCard content="c" openDelay={0}>
        <button type="button">hover</button>
      </HoverCard>
    );
    await user.hover(screen.getByRole("button", { name: "hover" }));
    expect(await screen.findByRole("dialog", { name: "Preview" })).toBeInTheDocument();
    unmount();

    render(
      <RialtoLocaleProvider messages={esMX}>
        <HoverCard content="c" openDelay={0}>
          <button type="button">hover</button>
        </HoverCard>
      </RialtoLocaleProvider>
    );
    await user.hover(screen.getByRole("button", { name: "hover" }));
    expect(await screen.findByRole("dialog", { name: esMX.preview })).toBeInTheDocument();
  });

  it("explicit ConfirmDialog labels still win over the locale", () => {
    render(
      <RialtoLocaleProvider messages={esMX}>
        <ConfirmDialog open onConfirm={noop} onCancel={noop} title="T" confirmLabel="Delete" />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
