import { type ReactNode } from "react";
import { Tooltip } from "../Tooltip/Tooltip";

export interface DisabledTooltipProps {
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
}

export function DisabledTooltip({ disabled, disabledReason, children }: DisabledTooltipProps) {
  if (disabled && disabledReason) {
    return (
      <Tooltip content={disabledReason} showOnFocus={false}>
        {children}
      </Tooltip>
    );
  }
  return <>{children}</>;
}
