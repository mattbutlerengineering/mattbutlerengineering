import { forwardRef, type HTMLAttributes } from "react";
import styles from "./InputGroup.module.css";

/**
 * Visually connects adjacent form controls (Input, Button, Select) into a
 * single row by stripping internal border-radii and collapsing double borders.
 *
 * @example
 * <InputGroup>
 *   <Input placeholder="Search..." />
 *   <Button variant="primary">Go</Button>
 * </InputGroup>
 */
export type InputGroupProps = HTMLAttributes<HTMLDivElement>;

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[styles.group, className].filter(Boolean).join(" ")}
        role="group"
        {...props}
      >
        {children}
      </div>
    );
  }
);

InputGroup.displayName = "InputGroup";
