import { LocalePicker } from "../LocalePicker";
import { useWidgetLocaleRuntime } from "./WidgetLocaleScope.js";
import styles from "./BookingWidget.module.css";

/** The compact locale picker for a guest surface; renders nothing outside a WidgetLocaleScope. */
export function WidgetLocalePicker() {
  const runtime = useWidgetLocaleRuntime();
  if (!runtime) return null;
  return (
    <div className={styles.localePicker}>
      <LocalePicker variant="compact" runtime={runtime} />
    </div>
  );
}
