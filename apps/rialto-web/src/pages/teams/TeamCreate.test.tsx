import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChangeEvent, ReactNode, Ref } from "react";
import { MemoryRouter, Routes, Route } from "react-router";
import { TeamCreate } from "./TeamCreate";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto (house pattern — the real
// package resolves to an unbuilt dist in worktrees, see SignIn.test.tsx /
// DriverList.test.tsx). Input/NumberInput/Select round-trip value/onChange
// keyed by label; Steps marks the current step with aria-current; Button
// mirrors the real isLoading/loadingText contract so the success-beat label
// swap is observable the same way SignIn's submit button is.
// ---------------------------------------------------------------------------
const toastSpy = vi.hoisted(() => vi.fn());
const deviceContextRef = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock("@mattbutlerengineering/rialto", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;

  const Input = ({
    label,
    value,
    onChange,
    required,
  }: {
    label?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    required?: boolean;
  }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={onChange} required={required} />
    </label>
  );

  const NumberInput = ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value?: number;
    onChange?: (value: number) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    </label>
  );

  const Select = ({
    label,
    value,
    onChange,
    options,
  }: {
    label?: string;
    value?: string;
    onChange?: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );

  const Steps = ({ steps, currentStep }: { steps: { label: string }[]; currentStep: number }) => (
    <ol data-testid="steps">
      {steps.map((step, index) => (
        <li key={step.label} aria-current={index === currentStep ? "step" : undefined}>
          {step.label}
        </li>
      ))}
    </ol>
  );

  const Button = ({
    children,
    onClick,
    disabled,
    type = "button",
    isLoading,
    loadingText,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
    isLoading?: boolean;
    loadingText?: string;
  }) => (
    <button type={type} onClick={onClick} disabled={disabled || isLoading}>
      {isLoading && loadingText ? loadingText : children}
    </button>
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

  const Heading = ({
    children,
    level = 2,
    ref,
    ...props
  }: {
    children?: ReactNode;
    level?: number;
    ref?: Ref<HTMLHeadingElement>;
  }) => {
    const Tag = `h${level}` as "h2";
    return (
      <Tag ref={ref} {...props}>
        {children}
      </Tag>
    );
  };

  const useToast = () => ({ toast: toastSpy });
  const useDeviceContext = () => deviceContextRef;

  return {
    Alert: ({ title, children }: { title?: ReactNode; children?: ReactNode }) => (
      <div role="alert">
        <p>{title}</p>
        {children}
      </div>
    ),
    Badge: Pass,
    Breadcrumb: () => null,
    Button,
    Card: Pass,
    DataList,
    Divider: () => <hr />,
    Heading,
    Input,
    NumberInput,
    Select,
    Steps,
    Text: Pass,
    useToast,
    useDeviceContext,
  };
});

function renderTeamCreate() {
  return render(
    <MemoryRouter>
      <TeamCreate />
    </MemoryRouter>
  );
}

/** Renders TeamCreate behind a real route so a `navigate()` call is
 *  observable as the dashboard route's marker mounting — same convention
 *  as SignIn.test.tsx's renderSignInWithRoutes. */
function renderTeamCreateWithRoutes() {
  return render(
    <MemoryRouter initialEntries={["/demos/teams/new"]}>
      <Routes>
        <Route path="/demos/teams/new" element={<TeamCreate />} />
        <Route path="/demos/dashboard" element={<div data-testid="dashboard-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

function fillTeamInfoStep() {
  fireEvent.change(screen.getByLabelText("Team Name"), { target: { value: "Scuderia Nova" } });
  fireEvent.change(screen.getByLabelText("Base City"), { target: { value: "Maranello" } });
  fireEvent.change(screen.getByLabelText("Team Principal"), { target: { value: "A. Rossi" } });
}

function fillCarSetupStep() {
  fireEvent.change(screen.getByLabelText("Chassis Designation"), { target: { value: "SN-01" } });
  fireEvent.change(screen.getByLabelText("Engine Supplier"), { target: { value: "Ferrari" } });
  fireEvent.change(screen.getByLabelText("Primary Livery Color"), { target: { value: "Red" } });
}

function advanceStep() {
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}

/** Drives the wizard through all three steps and clicks Register Team,
 *  leaving the success-beat timers pending for the caller to advance. */
function completeWizardAndRegister() {
  fillTeamInfoStep();
  advanceStep();
  fillCarSetupStep();
  advanceStep();
  fireEvent.click(screen.getByRole("button", { name: /^register team$/i }));
}

beforeEach(() => {
  vi.useFakeTimers();
  toastSpy.mockClear();
  deviceContextRef.reducedMotion = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TeamCreate — registration success handoff", () => {
  it("confirms the registered team by name once the success beat settles", async () => {
    renderTeamCreateWithRoutes();
    completeWizardAndRegister();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100); // network delay + settle beat
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Scuderia Nova"),
        variant: "success",
      })
    );
  });

  it("keeps the wizard controls disabled from success through handoff", async () => {
    renderTeamCreateWithRoutes();
    completeWizardAndRegister();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400); // network delay only — now in the success beat
    });

    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /registered/i })).toBeDisabled();
    expect(screen.queryByTestId("dashboard-page")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400); // settle beat + post-toast handoff beat
    });

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("lands on the dashboard after the full handoff beat elapses", async () => {
    renderTeamCreateWithRoutes();
    completeWizardAndRegister();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800); // network + settle + handoff
    });

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("shortens the success beat under reduced motion", async () => {
    deviceContextRef.reducedMotion = true;
    renderTeamCreateWithRoutes();
    completeWizardAndRegister();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400); // network delay (not shortened)
      await vi.advanceTimersByTimeAsync(400); // well under the full 1400ms standard beat
    });

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("cannot fire Register Team twice", async () => {
    renderTeamCreate();
    fillTeamInfoStep();
    advanceStep();
    fillCarSetupStep();
    advanceStep();

    fireEvent.click(screen.getByRole("button", { name: /^register team$/i }));
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });

    expect(toastSpy).toHaveBeenCalledTimes(1);
  });
});

describe("TeamCreate — step-change focus", () => {
  function stepHeading(name: string) {
    return screen.getByRole("heading", { level: 2, name });
  }

  it("does not steal focus on first mount", () => {
    renderTeamCreate();
    expect(document.body).toHaveFocus();
    expect(stepHeading("Team Info")).not.toHaveFocus();
  });

  it("moves focus to the new step heading after Next", () => {
    renderTeamCreate();
    fillTeamInfoStep();
    const next = screen.getByRole("button", { name: /^next$/i });
    next.focus();
    fireEvent.click(next);

    const heading = stepHeading("Car Setup");
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(document.body).not.toHaveFocus();
  });

  it("moves focus to the review heading after the second Next", () => {
    renderTeamCreate();
    fillTeamInfoStep();
    advanceStep();
    fillCarSetupStep();
    const next = screen.getByRole("button", { name: /^next$/i });
    next.focus();
    fireEvent.click(next);

    expect(stepHeading("Review")).toHaveFocus();
  });

  it("moves focus to the previous step heading on Back", () => {
    renderTeamCreate();
    fillTeamInfoStep();
    advanceStep();
    expect(stepHeading("Car Setup")).toHaveFocus();

    const back = screen.getByRole("button", { name: /^back$/i });
    back.focus();
    fireEvent.click(back);

    expect(stepHeading("Team Info")).toHaveFocus();
    expect(screen.getByLabelText("Team Name")).toHaveValue("Scuderia Nova");
  });

  it("moves focus back to Car Setup when leaving Review", () => {
    renderTeamCreate();
    fillTeamInfoStep();
    advanceStep();
    fillCarSetupStep();
    advanceStep();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(stepHeading("Car Setup")).toHaveFocus();
    expect(screen.getByLabelText("Chassis Designation")).toHaveValue("SN-01");
  });

  it("leaves an empty step 1 to native validation instead of focusing the heading", () => {
    renderTeamCreate();
    const next = screen.getByRole("button", { name: /^next$/i });
    next.focus();
    fireEvent.click(next);

    expect(screen.queryByLabelText("Chassis Designation")).not.toBeInTheDocument();
    expect(stepHeading("Team Info")).not.toHaveFocus();
    const active = document.activeElement;
    expect(active === next || active === screen.getByLabelText("Team Name")).toBe(true);
  });

  it("keeps the step-2 error alert and leaves focus on Next when the step does not change", () => {
    renderTeamCreate();
    fillTeamInfoStep();
    advanceStep();
    fireEvent.change(screen.getByLabelText("Chassis Designation"), { target: { value: "SF-24" } });

    const next = screen.getByRole("button", { name: /^next$/i });
    next.focus();
    fireEvent.click(next);

    expect(screen.getByRole("alert")).toHaveTextContent(/engine supplier/i);
    expect(next).toHaveFocus();
    expect(stepHeading("Car Setup")).not.toHaveFocus();
  });

  it("moves focus with Enter and Space from Next", async () => {
    vi.useRealTimers();
    const user = userEvent.setup({ delay: null });
    renderTeamCreate();
    fillTeamInfoStep();

    const next = screen.getByRole("button", { name: /^next$/i });
    next.focus();
    await user.keyboard("{Enter}");
    expect(stepHeading("Car Setup")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Chassis Designation"), { target: { value: "SF-24" } });
    fireEvent.change(screen.getByLabelText("Engine Supplier"), { target: { value: "Ferrari" } });
    fireEvent.change(screen.getByLabelText("Primary Livery Color"), { target: { value: "Red" } });

    const secondNext = screen.getByRole("button", { name: /^next$/i });
    secondNext.focus();
    await user.keyboard(" ");
    expect(stepHeading("Review")).toHaveFocus();
  });
});
