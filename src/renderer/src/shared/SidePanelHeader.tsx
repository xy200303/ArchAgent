import type { LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

export function SidePanelHeader({
  title,
  icon: Icon,
  meta,
  actions
}: {
  title: string;
  icon: LucideIcon;
  meta?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <header className="side-panel-header">
      <div className="side-panel-header-copy">
        <div className="side-panel-header-title">
          <Icon size={17} aria-hidden="true" />
          <strong>{title}</strong>
        </div>
        {meta ? <span title={meta}>{meta}</span> : null}
      </div>
      {actions ? <div className="side-panel-header-actions">{actions}</div> : null}
    </header>
  );
}
