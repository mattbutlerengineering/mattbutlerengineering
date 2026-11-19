import { forwardRef, useState, useRef, useCallback, useEffect, useId } from "react";
import { motion, useMotionValue } from "framer-motion";
import { Lock } from "lucide-react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { useDirection } from "../../hooks/useDirection";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import styles from "./Slider.module.css";

/**
 * Continuous range slider with a spring-animated knob, pointer drag, and keyboard support.
 * Works as both controlled (`value` + `onChange`) and uncontrolled (`defaultValue`).
 *
 * @example
 * <Slider label="Volume" min={0} max={100} value={vol} onChange={setVol} showValue />
 * <Slider label="Opacity" defaultValue={50} formatValue={(v) => `${v}%`} />
 * <Slider label="Brightness" disabled />
 */
export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  label?: string;
  /** Display the current numeric value beside the label */
  showValue?: boolean;
  /** Format the displayed value */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  /** Explains why the slider is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  className?: string;
  "aria-label"?: string;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

function quantize(val: number, min: number, step: number) {
  return Math.round((val - min) / step) * step + min;
}

/** Share of the track a PageUp/PageDown press travels before it is snapped to `step`. */
const PAGE_KEY_RANGE_FRACTION = 0.1;

/**
 * Distance a PageUp/PageDown press moves.
 *
 * Applying 10% of the range and then rounding the result onto `step` is not
 * symmetric: on a 30–80 slider with step 2, 50 + 5 snaps to 56 and 56 − 5 snaps to 52.
 * Snap the distance itself to a whole number of steps (at least one) first, so
 * the opposite key returns to the value it started from.
 */
function pageKeyDelta(min: number, max: number, step: number): number {
  if (!(step > 0) || !(max > min)) return step > 0 ? step : 0;
  const steps = Math.max(1, Math.round(((max - min) * PAGE_KEY_RANGE_FRACTION) / step));
  return steps * step;
}

export const Slider = forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      min = 0,
      max = 100,
      step = 1,
      value: controlledValue,
      defaultValue,
      onChange,
      label,
      showValue,
      formatValue = (v) => String(v),
      disabled,
      disabledReason,
      className,
      "aria-label": ariaLabel,
    },
    ref
  ) => {
    const autoId = useId();
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [internalValue, setInternalValue] = useState(defaultValue ?? min);
    const { spring } = useMotionPreset();
    const dir = useDirection(trackRef);

    const isControlled = controlledValue !== undefined;
    const currentValue = isControlled ? controlledValue : internalValue;
    const percent = ((currentValue - min) / (max - min)) * 100;

    // The knob rides a full-width overlay translated by a percentage translateX,
    // keeping the motion on the compositor (no `left` reflow) and needing no
    // measurement, so it is placed correctly on first paint. In RTL the knob is
    // anchored to the inline-start (right) edge via CSS, so the physical
    // translateX is negated to travel toward the inline-end.
    const signedPercent = dir === "rtl" ? -percent : percent;
    const knobX = useMotionValue(`${signedPercent}%`);

    useEffect(() => {
      knobX.set(`${signedPercent}%`);
    }, [signedPercent, knobX]);

    const setValue = useCallback(
      (raw: number) => {
        const quantized = quantize(clamp(raw, min, max), min, step);
        // Round to avoid floating point artifacts
        const rounded = Math.round(quantized * 1e10) / 1e10;
        if (!isControlled) setInternalValue(rounded);
        onChange?.(rounded);
      },
      [min, max, step, isControlled, onChange]
    );

    const getValueFromPointer = useCallback(
      (clientX: number) => {
        const track = trackRef.current;
        if (!track) return currentValue;
        const rect = track.getBoundingClientRect();
        const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
        return min + ratio * (max - min);
      },
      [min, max, currentValue]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (disabled) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        setValue(getValueFromPointer(e.clientX));
      },
      [disabled, setValue, getValueFromPointer]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!dragging) return;
        setValue(getValueFromPointer(e.clientX));
      },
      [dragging, setValue, getValueFromPointer]
    );

    const handlePointerUp = useCallback(() => {
      setDragging(false);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        let newVal: number;
        switch (e.key) {
          case "ArrowRight":
          case "ArrowUp":
            e.preventDefault();
            newVal = currentValue + step;
            break;
          case "ArrowLeft":
          case "ArrowDown":
            e.preventDefault();
            newVal = currentValue - step;
            break;
          case "Home":
            e.preventDefault();
            newVal = min;
            break;
          case "End":
            e.preventDefault();
            newVal = max;
            break;
          case "PageUp":
            e.preventDefault();
            newVal = currentValue + pageKeyDelta(min, max, step);
            break;
          case "PageDown":
            e.preventDefault();
            newVal = currentValue - pageKeyDelta(min, max, step);
            break;
          default:
            return;
        }
        setValue(newVal);
      },
      [currentValue, step, min, max, setValue]
    );

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div ref={ref} className={cn(styles.wrapper, className)}>
          {(label || showValue) && (
            <div className={styles.labelRow}>
              {label && <span className={styles.label}>{label}</span>}
              {disabled && disabledReason && (
                <Lock size={12} aria-hidden className={styles.lockIcon} />
              )}
              {showValue && <span className={styles.value}>{formatValue(currentValue)}</span>}
            </div>
          )}
          <div
            ref={trackRef}
            className={styles.trackArea}
            aria-disabled={disabled || undefined}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>

            {/* Hidden range input for accessibility */}
            <input
              type="range"
              className={styles.input}
              id={autoId}
              min={min}
              max={max}
              step={step}
              value={currentValue}
              disabled={disabled}
              onChange={(e) => setValue(Number(e.target.value))}
              onKeyDown={handleKeyDown}
              aria-label={ariaLabel ?? label}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={currentValue}
              aria-valuetext={formatValue(currentValue)}
            />

            {/* Visual knob — the overlay spans the track so a percentage translateX
                positions the knob without animating layout. */}
            <motion.div
              className={styles.knobTrack}
              style={{ x: knobX }}
              animate={dragging ? undefined : { x: `${signedPercent}%` }}
              transition={dragging ? { duration: 0 } : spring}
            >
              <div className={styles.knob} data-dragging={dragging || undefined} />
            </motion.div>
          </div>
        </div>
      </DisabledTooltip>
    );
  }
);

Slider.displayName = "Slider";
