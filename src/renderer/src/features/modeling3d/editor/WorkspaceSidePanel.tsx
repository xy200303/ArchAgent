/** Provides the consistent shell used by every activity-bar side panel. */
import type { JSX, ReactNode } from "react";

export function WorkspaceSidePanel({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <aside className={className ? `workspace-side-panel ${className}` : "workspace-side-panel"} aria-label={label}>
      {children}
    </aside>
  );
}
