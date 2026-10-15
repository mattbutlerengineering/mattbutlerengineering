import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { RialtoLocaleProvider } from "../i18n/RialtoLocaleProvider";
import { esMX } from "../i18n/locales/es-MX";
import { frCA } from "../i18n/locales/fr-CA";
import { Autocomplete } from "./Autocomplete/Autocomplete";
import { AvatarGroup } from "./Avatar/Avatar";
import { ChalkboardItem } from "./Chalkboard/Chalkboard";
import { ChatPanel } from "./ChatPanel/ChatPanel";
import { Combobox } from "./Combobox/Combobox";
import { CommandPalette } from "./CommandPalette/CommandPalette";
import { DataTable } from "./DataTable/DataTable";
import { ErrorBoundary } from "./ErrorBoundary/ErrorBoundary";
import { Input } from "./Input/Input";
import { PinInput } from "./PinInput/PinInput";
import { Select } from "./Select/Select";
import { Tag } from "./Tag/Tag";
import { TextArea } from "./TextArea/TextArea";

const noop = () => {};
const options = [{ value: "a", label: "Alpha" }];
const Boom = () => {
  throw new Error("boom");
};

interface Case {
  readonly name: string;
  readonly ui: () => ReactNode;
  /** Visible or accessible text: [en-US, es-MX, fr-CA]. */
  readonly texts: readonly (readonly [string, string, string])[];
}

const CASES: readonly Case[] = [
  {
    name: "Tag remove",
    ui: () => (
      <Tag onDismiss={noop} dismissible>
        VIP
      </Tag>
    ),
    texts: [["Remove VIP", esMX.removeItem("VIP"), frCA.removeItem("VIP")]],
  },
  {
    name: "Input optional",
    ui: () => <Input label="Name" showOptional />,
    texts: [["(optional)", esMX.optional, frCA.optional]],
  },
  {
    name: "TextArea optional",
    ui: () => <TextArea label="Notes" showOptional />,
    texts: [["(optional)", esMX.optional, frCA.optional]],
  },
  {
    name: "Select optional",
    ui: () => <Select label="Pick" options={options} showOptional />,
    texts: [["(optional)", esMX.optional, frCA.optional]],
  },
  {
    name: "Combobox optional",
    ui: () => <Combobox label="Pick" options={options} showOptional />,
    texts: [["(optional)", esMX.optional, frCA.optional]],
  },
  {
    name: "Autocomplete optional",
    ui: () => <Autocomplete label="Pick" options={options} showOptional />,
    texts: [["(optional)", esMX.optional, frCA.optional]],
  },
  {
    name: "PinInput digit",
    ui: () => <PinInput label="PIN" length={2} />,
    texts: [["Digit 1 of 2", esMX.digitOf(1, 2), frCA.digitOf(1, 2)]],
  },
  {
    name: "Avatar overflow",
    ui: () => <AvatarGroup max={1} avatars={[{ name: "A B" }, { name: "C D" }]} />,
    texts: [["1 more", esMX.moreCount(1), frCA.moreCount(1)]],
  },
  {
    name: "Chalkboard sold out",
    ui: () => (
      <ul>
        <ChalkboardItem name="Crab" soldOut />
      </ul>
    ),
    texts: [["sold out", esMX.soldOut, frCA.soldOut]],
  },
  {
    name: "DataTable selection",
    ui: () => (
      <DataTable
        columns={[{ key: "n", header: "N" }]}
        data={[{ id: "1", n: "x" }]}
        rowKey={(r) => String(r.id)}
        selectionMode="multiple"
      />
    ),
    texts: [["Select all rows", esMX.selectAllRows, frCA.selectAllRows]],
  },
  {
    name: "ErrorBoundary",
    ui: () => (
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    ),
    texts: [
      ["Something went wrong", esMX.errorTitle, frCA.errorTitle],
      ["Refresh page", esMX.refreshPage, frCA.refreshPage],
    ],
  },
  {
    name: "CommandPalette",
    ui: () => <CommandPalette open onOpenChange={noop} items={[]} />,
    texts: [
      ["No results found", esMX.noResults, frCA.noResults],
      ["navigate", esMX.navigateHint, frCA.navigateHint],
      ["select", esMX.selectHint, frCA.selectHint],
      ["close", esMX.closeHint, frCA.closeHint],
    ],
  },
  {
    name: "ChatPanel",
    ui: () => (
      <ChatPanel
        standalone
        onClose={noop}
        api="/x"
        domainContext={{} as never}
        getAccessToken={() => null}
      />
    ),
    texts: [
      ["Send", esMX.send, frCA.send],
      ["Chat input", esMX.chatInput, frCA.chatInput],
    ],
  },
];

function present(text: string): boolean {
  return (
    screen.queryAllByText(text, { exact: false }).length > 0 ||
    screen.queryAllByLabelText(text, { exact: false }).length > 0
  );
}

describe("inputs and composites localize built-in text", () => {
  for (const c of CASES) {
    for (const [en, es, fr] of c.texts) {
      it(`${c.name}: "${en}" is English with no provider`, () => {
        render(<>{c.ui()}</>);
        expect(present(en)).toBe(true);
      });
      it(`${c.name}: "${en}" follows es-MX`, () => {
        render(<RialtoLocaleProvider messages={esMX}>{c.ui()}</RialtoLocaleProvider>);
        expect(present(es)).toBe(true);
        if (es !== en) expect(present(en)).toBe(false);
      });
      it(`${c.name}: "${en}" follows fr-CA`, () => {
        render(<RialtoLocaleProvider messages={frCA}>{c.ui()}</RialtoLocaleProvider>);
        expect(present(fr)).toBe(true);
      });
    }
  }
});
