import { Input } from "@mattbutlerengineering/rialto";
import styles from "./venue-theme.module.css";

interface ColorSwatchProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: boolean;
  readonly showOptional?: boolean;
}

/** A hex text field with a live chip of the colour it holds. */
export function ColorSwatch({ label, value, onChange, error, showOptional }: ColorSwatchProps) {
  return (
    <div className={styles.swatch}>
      <span className={styles.chip} style={{ background: value }} aria-hidden="true" />
      <Input
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        showOptional={showOptional}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
