/** Provides the consistent shell used by every activity-bar side panel. */
import type { LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { SidePanelHeader } from "../../../shared/SidePanelHeader";

export function WorkspaceSidePanel({
  label,
  title,
  icon,
  headerActions,
  className,
  children
}: {
  label: string;
  title?: string;
  icon?: LucideIcon;
  headerActions?: ReactNode;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <aside className={className ? `workspace-side-panel ${className}` : "workspace-side-panel"} aria-label={label}>
      {title && icon ? <SidePanelHeader title={title} icon={icon} actions={headerActions} /> : null}
      {children}
    </aside>
  );
}
