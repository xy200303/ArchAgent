/** Accessible icon-button wrapper used by compact renderer toolbars. */
import * as Tooltip from "@radix-ui/react-tooltip";
import type { JSX, ReactNode } from "react";

export function TooltipButton({
  label,
  className,
  onClick,
  children
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" className={className} onClick={onClick}>
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
