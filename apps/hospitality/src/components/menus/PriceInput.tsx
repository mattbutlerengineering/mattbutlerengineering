import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@mattbutlerengineering/rialto";
import { formatCentsForInput, parsePriceToCents } from "./price.js";

interface PriceInputProps {
  /** Visible label, already localized. */
  label: string;
  /** The saved price, in integer cents. */
  valueCents: number | null;
  /** Called with integer cents when the text is a valid amount, null while it is not. */
  onChange: (cents: number | null) => void;
}

/**
 * A price field that edits in major units ("12.50") and reports integer cents.
 * It owns the text so a half-typed "12." is never rewritten under the cursor.
 */
export function PriceInput({ label, valueCents, onChange }: PriceInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(() =>
    valueCents === null ? "" : formatCentsForInput(valueCents)
  );
  const [touched, setTouched] = useState(false);
  const invalid = touched && parsePriceToCents(text) === null;

  return (
    <Input
      label={label}
      inputMode="decimal"
      value={text}
      error={invalid}
      hint={invalid ? t("menus.editor.priceInvalid") : undefined}
      onChange={(event) => {
        setText(event.target.value);
        setTouched(true);
        onChange(parsePriceToCents(event.target.value));
      }}
    />
  );
}
