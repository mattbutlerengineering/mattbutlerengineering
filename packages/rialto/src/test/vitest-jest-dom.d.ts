export {};

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toBeChecked(): void;
    toBeDisabled(): void;
    toBeEmptyDOMElement(): void;
    toBeEnabled(): void;
    toBeInTheDocument(): void;
    toBeInvalid(): void;
    toBePartiallyChecked(): void;
    toBeRequired(): void;
    toBeValid(): void;
    toBeVisible(): void;
    toContainElement(element: Element | null): void;
    toContainHTML(htmlText: string): void;
    toHaveAccessibleDescription(description?: string | RegExp): void;
    toHaveAccessibleErrorMessage(message?: string | RegExp): void;
    toHaveAccessibleName(name?: string | RegExp): void;
    toHaveAttribute(attr: string, value?: unknown): void;
    toHaveClass(...classNames: string[]): void;
    toHaveDescription(description?: string | RegExp): void;
    toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): void;
    toHaveErrorMessage(message?: string | RegExp): void;
    toHaveFocus(): void;
    toHaveFormValues(values: Record<string, unknown>): void;
    toHaveRole(role: string): void;
    toHaveSelection(): void;
    toHaveStyle(css: string | Record<string, unknown>): void;
    toHaveTextContent(
      text: string | RegExp,
      options?: { normalizeWhitespace: boolean },
    ): void;
    toHaveValue(value: string | string[] | number | null): void;
  }
}
