import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { RialtoLocaleProvider } from "../i18n/RialtoLocaleProvider";
import { enGB } from "../i18n/locales/en-GB";
import { esMX } from "../i18n/locales/es-MX";
import { frCA } from "../i18n/locales/fr-CA";
import { enUS } from "../i18n/messages";
import { Breadcrumb } from "./Breadcrumb/Breadcrumb";
import { Calendar } from "./Calendar/Calendar";
import { DatePicker } from "./DatePicker/DatePicker";
import { DateRange } from "./DateRange/DateRange";
import { DateRangePicker } from "./DateRangePicker/DateRangePicker";
import { GlobalNav } from "./GlobalNav/GlobalNav";
import { ImageUpload } from "./ImageUpload/ImageUpload";
import { Navbar } from "./Navbar/Navbar";
import { NavigationMenu } from "./NavigationMenu/NavigationMenu";
import { NumberInput } from "./NumberInput/NumberInput";
import { Odometer } from "./Odometer/Odometer";
import { Pagination } from "./Pagination/Pagination";
import { ScrollArea } from "./ScrollArea/ScrollArea";
import { Sidebar } from "./Sidebar/Sidebar";
import { SkeletonGroup } from "./Skeleton/Skeleton";
import { Steps } from "./Steps/Steps";
import { ThemeToggle } from "./ThemeToggle/ThemeToggle";
import { TimePicker } from "./TimePicker/TimePicker";
import { Timeline } from "./Timeline/Timeline";

const noop = () => {};

interface Case {
  readonly name: string;
  readonly ui: () => ReactNode;
  /** [role, accessible name with no provider, accessible name under es-MX] */
  readonly checks: readonly (readonly [string, string, string])[];
}

const CASES: readonly Case[] = [
  {
    name: "Pagination",
    ui: () => <Pagination page={2} totalPages={5} onChange={noop} />,
    checks: [
      ["navigation", "Pagination", esMX.pagination],
      ["button", "Previous page", esMX.previousPage],
      ["button", "Next page", esMX.nextPage],
      ["button", "Page 3", esMX.pageNumber(3)],
    ],
  },
  {
    name: "Calendar",
    ui: () => <Calendar value={null} onChange={noop} />,
    checks: [
      ["button", "Previous month", esMX.previousMonth],
      ["button", "Next month", esMX.nextMonth],
    ],
  },
  {
    name: "DateRange",
    ui: () => <DateRange value={{ start: null, end: null }} onChange={noop} />,
    checks: [
      ["button", "Previous month", esMX.previousMonth],
      ["button", "Next month", esMX.nextMonth],
    ],
  },
  {
    name: "DatePicker without label",
    ui: () => <DatePicker value={null} onChange={noop} />,
    checks: [["combobox", "Choose date", esMX.chooseDate]],
  },
  {
    name: "DateRangePicker without label",
    ui: () => <DateRangePicker value={{ start: null, end: null }} onChange={noop} />,
    checks: [["combobox", "Choose date range", esMX.chooseDateRange]],
  },
  {
    name: "TimePicker without label",
    ui: () => <TimePicker value={null} onChange={noop} />,
    checks: [["combobox", "Choose time", esMX.chooseTime]],
  },
  {
    name: "NumberInput",
    ui: () => <NumberInput value={1} onChange={noop} />,
    checks: [
      ["button", "Decrease", esMX.decrease],
      ["button", "Increase", esMX.increase],
    ],
  },
  {
    name: "Breadcrumb",
    ui: () => <Breadcrumb items={[{ label: "a" }]} />,
    checks: [["navigation", "Breadcrumb", esMX.breadcrumb]],
  },
  {
    name: "Steps",
    ui: () => <Steps steps={[{ label: "a" }]} currentStep={0} />,
    checks: [["list", "Progress steps", esMX.progressSteps]],
  },
  {
    name: "Timeline",
    ui: () => <Timeline events={[{ title: "a" }]} />,
    checks: [["list", "Timeline", esMX.timeline]],
  },
  {
    name: "Sidebar expanded",
    ui: () => <Sidebar items={[{ id: "a", label: "a" }]} onCollapse={noop} />,
    checks: [
      ["navigation", "Sidebar navigation", esMX.sidebarNavigation],
      ["button", "Collapse sidebar", esMX.collapseSidebar],
    ],
  },
  {
    name: "Sidebar collapsed",
    ui: () => <Sidebar items={[{ id: "a", label: "a" }]} collapsed onCollapse={noop} />,
    checks: [["button", "Expand sidebar", esMX.expandSidebar]],
  },
  {
    name: "NavigationMenu",
    ui: () => <NavigationMenu items={[{ label: "a", href: "/" }]} />,
    checks: [["navigation", "Main navigation", esMX.mainNavigation]],
  },
  {
    name: "Navbar",
    ui: () => (
      <Navbar
        links={[{ id: "a", label: "a", children: [{ id: "b", label: "b", href: "/" }] }]}
        search={{}}
      />
    ),
    checks: [
      ["navigation", "Main navigation", esMX.mainNavigation],
      ["button", "Toggle submenu", esMX.toggleSubmenu],
    ],
  },
  {
    name: "GlobalNav",
    ui: () => <GlobalNav currentApp="marketing" />,
    checks: [
      ["navigation", "Global navigation", esMX.globalNavigation],
      ["button", "Open menu", esMX.openMenu],
    ],
  },
  {
    name: "ScrollArea",
    ui: () => <ScrollArea>x</ScrollArea>,
    checks: [["region", "Scrollable content", esMX.scrollableContent]],
  },
  {
    name: "SkeletonGroup",
    ui: () => <SkeletonGroup>x</SkeletonGroup>,
    checks: [["status", "Loading content", esMX.loadingContent]],
  },
  {
    name: "ImageUpload empty",
    ui: () => <ImageUpload />,
    checks: [["button", "Upload image", esMX.uploadImage]],
  },
  {
    name: "ImageUpload uploading",
    ui: () => <ImageUpload value="blob:x" progress={40} />,
    checks: [["progressbar", "Upload progress", esMX.uploadProgress]],
  },
  {
    name: "ImageUpload done",
    ui: () => <ImageUpload value="blob:x" done />,
    checks: [["status", "Upload complete", esMX.uploadComplete]],
  },
  {
    name: "ImageUpload idle preview",
    ui: () => <ImageUpload value="blob:x" />,
    checks: [
      ["button", "Replace", esMX.replaceImage],
      ["img", "Uploaded image", esMX.uploadedImage],
    ],
  },
];

describe("navigation and data components localize their built-in text (ADR-028)", () => {
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

  it("Navbar default search placeholder follows the locale", () => {
    const ui = <Navbar links={[]} search={{}} />;
    const { unmount } = render(ui);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    unmount();
    render(<RialtoLocaleProvider messages={esMX}>{ui}</RialtoLocaleProvider>);
    expect(screen.getByPlaceholderText(esMX.searchPlaceholder)).toBeInTheDocument();
  });

  it("GlobalNav close-menu label follows the locale", () => {
    render(
      <RialtoLocaleProvider messages={esMX}>
        <GlobalNav currentApp="marketing" />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("button", { name: esMX.openMenu })).toBeInTheDocument();
  });

  it("ImageUpload empty tile text follows the locale", () => {
    render(
      <RialtoLocaleProvider messages={esMX}>
        <ImageUpload />
      </RialtoLocaleProvider>
    );
    expect(screen.getByText(esMX.addImage)).toBeInTheDocument();
  });

  it("NumberInput optional marker follows the locale", () => {
    const ui = <NumberInput label="Qty" value={1} onChange={noop} showOptional />;
    const { unmount } = render(ui);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    unmount();
    render(<RialtoLocaleProvider messages={esMX}>{ui}</RialtoLocaleProvider>);
    expect(screen.getByText(esMX.optional)).toBeInTheDocument();
  });

  it("explicit props still win over the locale", () => {
    render(
      <RialtoLocaleProvider messages={esMX}>
        <Navbar links={[]} label="Site" search={{ placeholder: "Find" }} />
        <ImageUpload label="Logo" />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("navigation", { name: "Site" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logo" })).toBeInTheDocument();
  });

  it("en-GB reuses en-US wording and fr-CA defines every key", () => {
    expect(enGB).toEqual(enUS);
    expect(Object.keys(frCA).sort()).toEqual(Object.keys(enUS).sort());
    expect(Object.keys(esMX).sort()).toEqual(Object.keys(enUS).sort());
  });
});

describe("ThemeToggle accessible name follows the locale", () => {
  const LABELS = [
    ["es-MX", esMX, "Cambiar a modo claro", "Cambiar a modo oscuro"],
    ["fr-CA", frCA, "Passer au mode clair", "Passer au mode sombre"],
  ] as const;

  it.each(LABELS)("%s names both toggle directions", (_tag, messages, toLight, toDark) => {
    const { rerender } = render(
      <RialtoLocaleProvider messages={messages}>
        <ThemeToggle theme="dark" onToggle={noop} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("button", { name: toLight })).toBeInTheDocument();
    rerender(
      <RialtoLocaleProvider messages={messages}>
        <ThemeToggle theme="light" onToggle={noop} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("button", { name: toDark })).toBeInTheDocument();
  });
});

describe("Pagination announces page changes", () => {
  it("exposes a polite status region with the current page (English, no provider)", () => {
    render(<Pagination page={3} totalPages={20} onChange={noop} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Page 3 of 20");
  });

  it("updates the announcement when the page changes", () => {
    const { rerender } = render(<Pagination page={3} totalPages={20} onChange={noop} />);
    rerender(<Pagination page={4} totalPages={20} onChange={noop} />);
    expect(screen.getByRole("status")).toHaveTextContent("Page 4 of 20");
  });

  it("localizes the announcement", () => {
    render(
      <RialtoLocaleProvider messages={esMX}>
        <Pagination page={3} totalPages={20} onChange={noop} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Página 3 de 20");
  });
});

describe("context locale is the Intl fallback", () => {
  it("Calendar shows es-MX month names via context with no locale prop", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <Calendar value="2026-03-10" onChange={noop} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("grid", { name: /marzo/i })).toBeInTheDocument();
  });

  it("Calendar keeps today's behaviour with no provider", () => {
    render(<Calendar value="2026-03-10" onChange={noop} />);
    expect(screen.getByRole("grid", { name: /march/i })).toBeInTheDocument();
  });

  it("an explicit locale prop overrides the context locale", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <Calendar value="2026-03-10" onChange={noop} locale="fr-CA" />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("grid", { name: /mars/i })).toBeInTheDocument();
  });

  it("DateRange follows the context locale", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <DateRange value={{ start: "2026-03-10", end: null }} onChange={noop} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("grid", { name: /marzo/i })).toBeInTheDocument();
  });

  it("DatePicker trigger value follows the context locale", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <DatePicker label="Fecha" value="2026-03-10" onChange={noop} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("combobox")).toHaveValue("10 mar 2026");
  });

  it("DateRangePicker trigger value follows the context locale", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <DateRangePicker
          label="Fechas"
          value={{ start: "2026-03-10", end: "2026-03-12" }}
          onChange={noop}
        />
      </RialtoLocaleProvider>
    );
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toContain("mar");
  });

  it("TimePicker trigger value follows the context locale", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <TimePicker label="Hora" value="15:30" onChange={noop} />
      </RialtoLocaleProvider>
    );
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toMatch(/p\.\s?m\./i);
  });

  it("Odometer formats with the context locale", () => {
    render(
      <RialtoLocaleProvider locale="de-DE" messages={esMX}>
        <Odometer value={1234567} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("1.234.567");
  });

  it("Odometer keeps today's behaviour with no provider", () => {
    render(<Odometer value={1234567} locale="en-US" />);
    expect(screen.getByRole("status")).toHaveTextContent("1,234,567");
  });
});
