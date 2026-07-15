/** Accessible icon-button wrapper used by compact renderer toolbars. */
import * as Tooltip from "@radix-ui/react-tooltip";
import type { JSX, ReactNode } from "react";

export function TooltipButton({
  label,
  className,
  onClick,
  pressed,
  disabled,
  children
}: {
  label: string;
  className: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" className={className} onClick={onClick} aria-label={label} aria-pressed={pressed} disabled={disabled}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" sideOffset={7}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
