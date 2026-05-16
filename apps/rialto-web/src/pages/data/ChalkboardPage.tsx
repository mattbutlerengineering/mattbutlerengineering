import {
  Chalkboard,
  ChalkboardItem,
  ChalkboardSection,
  DataList,
  Stack,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

export function ChalkboardPage() {
  return (
    <ComponentPageLayout
      name="Chalkboard"
      description="A stylized menu board rendered like the daily-specials blackboard you see in small restaurants. Compound components build up the content: Chalkboard, ChalkboardSection, ChalkboardItem. The handwriting aesthetic is CSS-only — underneath it is plain semantic HTML (h2 / h3 / ul / li)."
    >
      {/* ── Canonical example ─────────────────────────────────────── */}
      <Section title="Daily Specials">
        <Chalkboard title="Today's Specials" subtitle="March 15" framed>
          <ChalkboardSection heading="Starters">
            <ChalkboardItem
              name="Crab Cakes"
              price="$14"
              description="with remoulade and frisée"
            />
            <ChalkboardItem
              name="Caesar Salad"
              price="$10"
              description="shaved parmesan, anchovy croutons"
            />
            <ChalkboardItem name="Oysters (½ dozen)" price="$18" soldOut />
          </ChalkboardSection>
          <ChalkboardSection heading="Mains">
            <ChalkboardItem
              name="Seared Duck Breast"
              price="$32"
              description="cherry gastrique, wild rice"
            />
            <ChalkboardItem
              name="Linguine Vongole"
              price="$24"
              description="Manila clams, white wine, chili"
            />
            <ChalkboardItem
              name="Dry-Aged Ribeye"
              price="$48"
              description="14oz, béarnaise on the side"
            />
          </ChalkboardSection>
          <ChalkboardSection heading="Desserts">
            <ChalkboardItem name="Crème Brûlée" price="$10" />
            <ChalkboardItem
              name="Flourless Chocolate Torte"
              price="$11"
              description="raspberry coulis, crème fraîche"
            />
          </ChalkboardSection>
        </Chalkboard>
      </Section>

      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <Stack direction="row" gap="lg" wrap align="start">
          <Chalkboard title="Slate" subtitle="Default">
            <ChalkboardSection>
              <ChalkboardItem name="Item One" price="$8" />
              <ChalkboardItem name="Item Two" price="$12" />
            </ChalkboardSection>
          </Chalkboard>
          <Chalkboard title="Green" subtitle="Schoolroom" variant="green">
            <ChalkboardSection>
              <ChalkboardItem name="Item One" price="$8" />
              <ChalkboardItem name="Item Two" price="$12" />
            </ChalkboardSection>
          </Chalkboard>
        </Stack>
      </Section>

      {/* ── Minimal ───────────────────────────────────────────────── */}
      <Section title="Minimal (no frame, single section)">
        <Chalkboard>
          <ChalkboardSection heading="Drinks">
            <ChalkboardItem name="Espresso" price="$4" />
            <ChalkboardItem name="Cappuccino" price="$5" />
            <ChalkboardItem name="Iced Latte" price="$6" />
          </ChalkboardSection>
        </Chalkboard>
      </Section>

      {/* ── Props: Chalkboard ─────────────────────────────────────── */}
      <Section title="Props: Chalkboard">
        <PropsTable
          props={[
            { name: "title", type: "string", description: "Rendered as an h2 inside the header." },
            { name: "subtitle", type: "string", description: "Secondary context under the title — often a date." },
            { name: "variant", type: '"slate" | "green"', default: '"slate"', description: "Visual palette." },
            { name: "framed", type: "boolean", default: "false", description: "Wraps the board in a wooden frame border." },
            { name: "children", type: "ReactNode", description: "Typically ChalkboardSection components." },
          ]}
        />
      </Section>

      {/* ── Props: ChalkboardSection ──────────────────────────────── */}
      <Section title="Props: ChalkboardSection">
        <PropsTable
          props={[
            { name: "heading", type: "string", description: "Rendered as an h3 above the list." },
            { name: "children", type: "ReactNode", description: "ChalkboardItem components." },
          ]}
        />
      </Section>

      {/* ── Props: ChalkboardItem ─────────────────────────────────── */}
      <Section title="Props: ChalkboardItem">
        <PropsTable
          props={[
            { name: "name", type: "string", description: "Item name, required." },
            { name: "price", type: "string", description: "Displayed on the right; use any currency format." },
            { name: "description", type: "string", description: "Secondary text below the name." },
            { name: "soldOut", type: "boolean", default: "false", description: "Strikes through the item and adds a 'sold out' label readable by AT." },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Heading hierarchy", value: "Title → h2, section heading → h3 — outlines cleanly under any page" },
            { label: "List markup", value: "Items are rendered as <ul>/<li> — announced as a list with count" },
            { label: "Sold-out label", value: "Rendered as actual text — strikethrough is cosmetic, not sole indicator" },
            { label: "Decorative effects", value: "Chalk dust overlay is aria-hidden" },
            { label: "Font fallback", value: "System handwriting stack — degrades gracefully if Caveant not loaded" },
            { label: "Contrast", value: "Chalk-on-slate and chalk-on-green both meet WCAG AA for normal text" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ChalkboardPage.displayName = "ChalkboardPage";
