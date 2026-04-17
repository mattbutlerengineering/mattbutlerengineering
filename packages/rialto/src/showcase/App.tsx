import { useState, type ReactNode } from "react";
import { RialtoProvider, type VibeName } from "../providers";
import { SegmentedControl } from "../components/SegmentedControl/SegmentedControl";
import { TokensSection } from "./sections/TokensSection";
import { FoundationSection } from "./sections/FoundationSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { FormSection } from "./sections/FormSection";
import { OverlaySection } from "./sections/OverlaySection";
import { DataSection } from "./sections/DataSection";
import { LayoutSection } from "./sections/LayoutSection";
import css from "./showcase.module.css";

type ThemeMode = "light" | "dark";

const THEMES: ReadonlyArray<{ label: string; value: ThemeMode }> = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const VIBES: ReadonlyArray<{ label: string; value: VibeName }> = [
  { label: "Default", value: "default" },
  { label: "Transacting", value: "transacting" },
  { label: "Presenting", value: "presenting" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={css.section}>
      <h2 className={css.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={css.subsection}>
      <h3 className={css.subsectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [vibe, setVibe] = useState<VibeName>("default");

  return (
    <RialtoProvider theme={theme} vibe={vibe}>
      <div className={css.page}>
        <header className={css.header}>
          <h1 className={css.title}>Rialto Component Showcase</h1>
          <div className={css.controls}>
            <SegmentedControl
              value={theme}
              onValueChange={(v) => setTheme(v as ThemeMode)}
              options={THEMES}
            />
            <SegmentedControl
              value={vibe}
              onValueChange={(v) => setVibe(v as VibeName)}
              options={VIBES}
            />
          </div>
        </header>

        <main className={css.main}>
          <Section title="Design Tokens">
            <TokensSection />
          </Section>

          <Section title="Foundation">
            <Subsection title="Typography">
              <FoundationSection which="typography" />
            </Subsection>
            <Subsection title="Buttons">
              <FoundationSection which="buttons" />
            </Subsection>
            <Subsection title="Badges & Tags">
              <FoundationSection which="badges" />
            </Subsection>
            <Subsection title="Avatars">
              <FoundationSection which="avatars" />
            </Subsection>
          </Section>

          <Section title="Form Controls">
            <Subsection title="Text Inputs">
              <FormSection which="inputs" />
            </Subsection>
            <Subsection title="Toggles & Checkboxes">
              <FormSection which="toggles" />
            </Subsection>
            <Subsection title="Select & Autocomplete">
              <FormSection which="selects" />
            </Subsection>
            <Subsection title="Sliders & Number">
              <FormSection which="sliders" />
            </Subsection>
          </Section>

          <Section title="Feedback & Status">
            <FeedbackSection />
          </Section>

          <Section title="Overlays & Modals">
            <OverlaySection />
          </Section>

          <Section title="Data Display">
            <DataSection />
          </Section>

          <Section title="Layout">
            <LayoutSection />
          </Section>
        </main>
      </div>
    </RialtoProvider>
  );
}

export { Section, Subsection };
