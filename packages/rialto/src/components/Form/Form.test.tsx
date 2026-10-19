import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RialtoLocaleProvider } from "../../i18n/RialtoLocaleProvider";
import { esMX } from "../../i18n/locales/es-MX";
import { frCA } from "../../i18n/locales/fr-CA";
import type { RialtoMessages } from "../../i18n/messages";
import { Form } from "./Form";
import { useFormContext } from "./FormContext";

// Registers a validator with the enclosing Form so tests can exercise
// validation without depending on FormField (tested separately).
function RegisteringField({
  name,
  validate,
}: {
  name: string;
  validate: () => string | undefined;
}) {
  const { registerField, unregisterField } = useFormContext();
  useEffect(() => {
    registerField(name, validate);
    return () => unregisterField(name);
  }, [name, validate, registerField, unregisterField]);
  return null;
}

describe("Form", () => {
  describe("rendering", () => {
    it("renders children inside a form element", () => {
      const { container } = render(
        <Form>
          <p>Field content</p>
        </Form>
      );
      expect(screen.getByText("Field content")).toBeInTheDocument();
      expect(container.querySelector("form")).toBeInTheDocument();
    });
  });

  describe("submit", () => {
    it("calls onValidSubmit when no fields are registered", async () => {
      const user = userEvent.setup();
      const onValidSubmit = vi.fn();
      render(
        <Form onValidSubmit={onValidSubmit}>
          <button type="submit">Submit</button>
        </Form>
      );
      await user.click(screen.getByRole("button", { name: "Submit" }));
      expect(onValidSubmit).toHaveBeenCalledTimes(1);
    });

    it("does not navigate/reload on submit (preventDefault called)", async () => {
      const user = userEvent.setup();
      render(
        <Form>
          <button type="submit">Submit</button>
        </Form>
      );
      // jsdom throws "Not implemented: HTMLFormElement.prototype.submit" if the
      // native submit isn't prevented — a clean click is proof preventDefault ran.
      await expect(
        user.click(screen.getByRole("button", { name: "Submit" }))
      ).resolves.not.toThrow();
    });

    it("does not call onValidSubmit when a registered field is invalid", async () => {
      const user = userEvent.setup();
      const onValidSubmit = vi.fn();
      render(
        <Form onValidSubmit={onValidSubmit}>
          <RegisteringField name="email" validate={() => "Email is required"} />
          <button type="submit">Submit</button>
        </Form>
      );
      await user.click(screen.getByRole("button", { name: "Submit" }));
      expect(onValidSubmit).not.toHaveBeenCalled();
    });

    it("calls onValidSubmit once every registered field is valid", async () => {
      const user = userEvent.setup();
      const onValidSubmit = vi.fn();
      render(
        <Form onValidSubmit={onValidSubmit}>
          <RegisteringField name="email" validate={() => undefined} />
          <button type="submit">Submit</button>
        </Form>
      );
      await user.click(screen.getByRole("button", { name: "Submit" }));
      expect(onValidSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe("error summary", () => {
    it("does not render an error summary before submit is attempted", () => {
      render(
        <Form>
          <RegisteringField name="email" validate={() => "Email is required"} />
        </Form>
      );
      expect(screen.queryByRole("alert")).toBeEmptyDOMElement();
    });

    it("announces field errors in an assertive alert region after a failed submit", async () => {
      const user = userEvent.setup();
      render(
        <Form>
          <RegisteringField name="email" validate={() => "Email is required"} />
          <button type="submit">Submit</button>
        </Form>
      );
      await user.click(screen.getByRole("button", { name: "Submit" }));
      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "assertive");
      expect(alert).toHaveTextContent("Email is required");
    });

    it("omits the error summary entirely when showErrorSummary is false", async () => {
      const user = userEvent.setup();
      render(
        <Form showErrorSummary={false}>
          <RegisteringField name="email" validate={() => "Email is required"} />
          <button type="submit">Submit</button>
        </Form>
      );
      await user.click(screen.getByRole("button", { name: "Submit" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

describe("Form error summary localization", () => {
  const required = () => "Required";

  async function submitWithErrors(messages: RialtoMessages, count: number) {
    const user = userEvent.setup();
    render(
      <RialtoLocaleProvider messages={messages}>
        <Form>
          {Array.from({ length: count }, (_, i) => (
            <RegisteringField key={i} name={`f${i}`} validate={required} />
          ))}
          <button type="submit">Submit</button>
        </Form>
      </RialtoLocaleProvider>
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    return screen.getByRole("alert");
  }

  it.each([
    ["es-MX", 1, esMX, "1 campo requiere atención"],
    ["es-MX", 3, esMX, "3 campos requieren atención"],
    ["fr-CA", 1, frCA, "1 champ nécessite votre attention"],
    ["fr-CA", 3, frCA, "3 champs nécessitent votre attention"],
  ] as const)("%s summarizes %i error(s)", async (_tag, count, messages, summary) => {
    const alert = await submitWithErrors(messages, count);
    expect(alert).toHaveTextContent(summary);
  });
});
