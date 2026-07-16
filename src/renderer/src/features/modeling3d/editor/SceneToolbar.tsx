/** The single top bar for the active modeling workspace and its side panels. */
import type { LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

export function SceneToolbar({
  title,
  icon: Icon,
  children,
  className
}: {
  title: string;
  icon: LucideIcon;
  children?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <header className={className ? `scene-toolbar ${className}` : "scene-toolbar"}>
      <div className="scene-toolbar-title">
        <Icon size={17} aria-hidden="true" />
        <h2>{title}</h2>
      </div>
      {children ? <div className="scene-toolbar-actions">{children}</div> : null}
    </header>
  );
}
