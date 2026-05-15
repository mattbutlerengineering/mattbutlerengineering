import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

/* ── Components ─────────────────────────────── */
import {
  Chalkboard,
  ChalkboardSection,
  ChalkboardItem,
} from "../../components/Chalkboard/Chalkboard";
import { Ferrofluid } from "../../components/Ferrofluid/Ferrofluid";
import { MasterOverride } from "../../components/MasterOverride/MasterOverride";
import { SplitFlap } from "../../components/SplitFlap/SplitFlap";
import { SplitScreenExit } from "../../components/SplitScreenExit/SplitScreenExit";
import { TapeChart } from "../../components/TapeChart/TapeChart";

describe("Accessibility — Specialty Components", () => {
  it("Chalkboard", async () => {
    const { container } = render(
      <Chalkboard title="Board">
        <ChalkboardSection heading="Items">
          <ChalkboardItem name="Item 1" price="$10" />
        </ChalkboardSection>
      </Chalkboard>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Ferrofluid", async () => {
    const { container } = render(<Ferrofluid blobCount={3} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("MasterOverride", async () => {
    const { container } = render(<MasterOverride label="Launch" on={false} onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("SplitFlap", async () => {
    const { container } = render(<SplitFlap value="RIALTO" aria-label="Status: RIALTO" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("SplitScreenExit", async () => {
    const { container } = render(
      <SplitScreenExit active={false}>
        <button>Sign in</button>
      </SplitScreenExit>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("TapeChart", async () => {
    const { container } = render(
      <TapeChart rooms={[]} reservations={[]} startDate="2026-04-20" endDate="2026-04-27" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
