import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChangeEvent, ElementType, ReactNode, Ref } from "react";
import { OnboardingExamplePage } from "./OnboardingExamplePage.js";
import {
  ONBOARDING_STEPS,
  INITIAL_ONBOARDING_STATE,
  LAST_STEP_INDEX,
  PROPERTY_TYPES,
  completionPercent,
  isFinalStep,
  launchSummary,
  nextStep,
  previousStep,
} from "./onboarding.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs preserve the semantics the assertions
// depend on: Text honors `as` and forwards `ref`/`id`/`tabIndex` (so the step
// heading stays a focusable, referenceable heading), Steps exposes the current
// index, Progress emits the progressbar contract, Button forwards `disabled`,
// and the field components round-trip their value through onChange keyed by
// label so back-navigation's state preservation is really exercised.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({
    as,
    id,
    tabIndex,
    ref,
    children,
  }: {
    as?: ElementType;
    id?: string;
    tabIndex?: number;
    ref?: Ref<HTMLElement>;
    children?: ReactNode;
  }) => {
    const Tag = as ?? "p";
    return (
      <Tag ref={ref} id={id} tabIndex={tabIndex}>
        {children}
      </Tag>
    );
  };

  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  const Badge = ({ children, variant = "neutral" }: { children?: ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  );

  const Button = ({
    children,
    variant = "secondary",
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    variant?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );

  const Steps = ({
    steps,
    currentStep,
    orientation = "horizontal",
  }: {
    steps: { label: string }[];
    currentStep: number;
    orientation?: string;
  }) => (
    <ol data-testid="steps" data-current={currentStep} data-orientation={orientation}>
      {steps.map((step, i) => (
        <li key={step.label} aria-current={i === currentStep ? "step" : undefined}>
          {step.label}
        </li>
      ))}
    </ol>
  );

  const Progress = ({
    value,
    "aria-label": ariaLabel,
  }: {
    value?: number;
    "aria-label"?: string;
  }) => <div role="progressbar" aria-valuenow={value} aria-label={ariaLabel} />;

  const Input = ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label>
      {label}
      <input value={value} onChange={onChange} />
    </label>
  );

  const Select = ({
    label,
    options,
    value,
    onChange,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange?.(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const Toggle = ({
    label,
    checked,
    onCheckedChange,
  }: {
    label?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
    </label>
  );

  const SegmentedControl = ({
    segments,
    value,
    onChange,
    "aria-label": ariaLabel,
  }: {
    segments: { id: string; label: string }[];
    value: string;
    onChange: (id: string) => void;
    "aria-label"?: string;
  }) => (
    <div role="radiogroup" aria-label={ariaLabel}>
      {segments.map((segment) => (
        <button
          key={segment.id}
          type="button"
          role="radio"
          aria-checked={segment.id === value}
          onClick={() => onChange(segment.id)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );

  const DataList = ({ items }: { items: { label: string; value: ReactNode }[] }) => (
    <dl>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );

  return {
    Badge,
    Button,
    Card,
    DataList,
    Divider,
    Input,
    Progress,
    SegmentedControl,
    Select,
    Stack,
    Steps,
    Text,
    Toggle,
  };
});

const [PROPERTY_STEP, SPACES_STEP, PREFERENCES_STEP, LAUNCH_STEP] = ONBOARDING_STEPS as [
  (typeof ONBOARDING_STEPS)[number],
  (typeof ONBOARDING_STEPS)[number],
  (typeof ONBOARDING_STEPS)[number],
  (typeof ONBOARDING_STEPS)[number],
];

/** Clicks "Next" `count` times, as a keyboard-free user would. */
async function advance(user: ReturnType<typeof userEvent.setup>, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
}

describe("OnboardingExamplePage — initial render", () => {
  it("renders the showcase header", () => {
    render(<OnboardingExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Onboarding" })).toBeInTheDocument();
  });

  it("opens on the first step's heading", () => {
    render(<OnboardingExamplePage />);
    expect(
      screen.getByRole("heading", { level: 2, name: PROPERTY_STEP.heading })
    ).toBeInTheDocument();
  });

  it("shows the current step and the total", () => {
    render(<OnboardingExamplePage />);
    expect(screen.getByText(`Step 1 of ${ONBOARDING_STEPS.length}`)).toBeInTheDocument();
  });

  it("renders a persistent rail listing every step, with the first current", () => {
    render(<OnboardingExamplePage />);
    const rail = screen.getByTestId("steps");
    expect(rail).toHaveAttribute("data-current", "0");
    for (const step of ONBOARDING_STEPS) {
      expect(within(rail).getByText(step.label)).toBeInTheDocument();
    }
  });

  it("reports completion as a progressbar", () => {
    render(<OnboardingExamplePage />);
    expect(screen.getByRole("progressbar", { name: /progress/i })).toHaveAttribute(
      "aria-valuenow",
      String(completionPercent(0))
    );
  });

  it("disables Back on the first step", () => {
    render(<OnboardingExamplePage />);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("shows only the current step's fields", () => {
    render(<OnboardingExamplePage />);
    expect(screen.getByLabelText(/property name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/instant booking/i)).not.toBeInTheDocument();
  });
});

describe("OnboardingExamplePage — advancing", () => {
  it("walks forward through every step, tracking the rail, count, and progressbar", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);

    for (const [i, step] of ONBOARDING_STEPS.entries()) {
      expect(
        screen.getByRole("heading", { level: 2, name: step.heading }),
        `step ${i} heading`
      ).toBeInTheDocument();
      expect(screen.getByText(`Step ${i + 1} of ${ONBOARDING_STEPS.length}`)).toBeInTheDocument();
      expect(screen.getByTestId("steps")).toHaveAttribute("data-current", String(i));
      expect(screen.getByRole("progressbar", { name: /progress/i })).toHaveAttribute(
        "aria-valuenow",
        String(completionPercent(i))
      );
      if (!isFinalStep(i)) await advance(user, 1);
    }
  });

  it("swaps in each step's own fields", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);

    await advance(user, 1);
    expect(screen.getByLabelText("Spaces you offer")).toBeInTheDocument();
    expect(screen.queryByLabelText(/property name/i)).not.toBeInTheDocument();

    await advance(user, 1);
    expect(screen.getByLabelText(/instant booking/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/deposit/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Spaces you offer")).not.toBeInTheDocument();
  });

  it("enables Back once past the first step", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);
    await advance(user, 1);
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });
});

describe("OnboardingExamplePage — completion state", () => {
  it("replaces Next with a success state on the final step", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);
    await advance(user, LAST_STEP_INDEX);

    expect(
      screen.getByRole("heading", { level: 2, name: LAUNCH_STEP.heading })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

    const announcement = screen.getByRole("status");
    expect(within(announcement).getByTestId("badge")).toHaveAttribute("data-variant", "success");
  });

  it("restates every answer the flow collected", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);
    await advance(user, LAST_STEP_INDEX);

    // Scoped to the panel: the rail repeats several of these words as step labels.
    const panel = screen.getByRole("region", { name: LAUNCH_STEP.heading });
    for (const row of launchSummary(INITIAL_ONBOARDING_STATE)) {
      expect(within(panel).getByText(row.label)).toBeInTheDocument();
      expect(within(panel).getByText(row.value)).toBeInTheDocument();
    }
  });

  it("offers a restart that returns to the first step with defaults", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);

    await user.clear(screen.getByLabelText(/property name/i));
    await user.type(screen.getByLabelText(/property name/i), "Cedar Lodge");
    await advance(user, LAST_STEP_INDEX);

    await user.click(screen.getByRole("button", { name: /start over/i }));

    expect(
      screen.getByRole("heading", { level: 2, name: PROPERTY_STEP.heading })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/property name/i)).toHaveValue(
      INITIAL_ONBOARDING_STATE.propertyName
    );
  });
});

describe("OnboardingExamplePage — back navigation", () => {
  it("returns to the previous step", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);
    await advance(user, 2);
    expect(
      screen.getByRole("heading", { level: 2, name: PREFERENCES_STEP.heading })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(
      screen.getByRole("heading", { level: 2, name: SPACES_STEP.heading })
    ).toBeInTheDocument();
    expect(screen.getByText(`Step 2 of ${ONBOARDING_STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByTestId("steps")).toHaveAttribute("data-current", "1");
  });

  it("preserves answers entered on an earlier step", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);

    await user.clear(screen.getByLabelText(/property name/i));
    await user.type(screen.getByLabelText(/property name/i), "Cedar Lodge");
    const [, resort] = PROPERTY_TYPES;
    await user.click(screen.getByRole("radio", { name: resort!.label }));

    await advance(user, 1);
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByLabelText(/property name/i)).toHaveValue("Cedar Lodge");
    expect(screen.getByRole("radio", { name: resort!.label })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("navigates forward and back by keyboard alone", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);

    const next = screen.getByRole("button", { name: "Next" });
    next.focus();
    expect(next).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { level: 2, name: SPACES_STEP.heading })
    ).toBeInTheDocument();

    const back = screen.getByRole("button", { name: "Back" });
    back.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { level: 2, name: PROPERTY_STEP.heading })
    ).toBeInTheDocument();
  });
});

describe("OnboardingExamplePage — step-change announcement", () => {
  it("does not steal focus on first mount", () => {
    render(<OnboardingExamplePage />);
    expect(document.body).toHaveFocus();
  });

  it("moves focus to the new step's heading when advancing", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);
    await advance(user, 1);
    expect(screen.getByRole("heading", { level: 2, name: SPACES_STEP.heading })).toHaveFocus();
  });

  it("moves focus to the heading when going back", async () => {
    const user = userEvent.setup();
    render(<OnboardingExamplePage />);
    await advance(user, 2);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { level: 2, name: SPACES_STEP.heading })).toHaveFocus();
  });
});

describe("onboarding — step machine", () => {
  it("defines exactly four steps with unique ids", () => {
    expect(ONBOARDING_STEPS).toHaveLength(4);
    expect(new Set(ONBOARDING_STEPS.map((s) => s.id)).size).toBe(4);
  });

  it("LAST_STEP_INDEX points at the terminal step", () => {
    expect(LAST_STEP_INDEX).toBe(ONBOARDING_STEPS.length - 1);
  });

  it("nextStep advances one step and clamps at the last", () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(LAST_STEP_INDEX)).toBe(LAST_STEP_INDEX);
  });

  it("previousStep goes back one step and clamps at the first", () => {
    expect(previousStep(2)).toBe(1);
    expect(previousStep(0)).toBe(0);
  });

  it("isFinalStep is true only for the terminal step", () => {
    expect(isFinalStep(LAST_STEP_INDEX)).toBe(true);
    expect(isFinalStep(LAST_STEP_INDEX - 1)).toBe(false);
  });

  it("completionPercent rises with each step and reaches 100 at the end", () => {
    expect(completionPercent(0)).toBe(25);
    expect(completionPercent(LAST_STEP_INDEX)).toBe(100);
  });

  it("launchSummary restates every answer the flow collected", () => {
    const rows = launchSummary(INITIAL_ONBOARDING_STATE);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.label).toBeTruthy();
      expect(row.value).toBeTruthy();
    }
  });

  it("launchSummary reflects the entered property name", () => {
    const rows = launchSummary({ ...INITIAL_ONBOARDING_STATE, propertyName: "Cedar Lodge" });
    expect(rows.some((row) => row.value === "Cedar Lodge")).toBe(true);
  });
});
