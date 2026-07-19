/** The single top bar for the active modeling workspace and its side panels. */
import type { JSX, ReactNode } from "react";

export function SceneToolbar({
  children,
  className
}: {
  children?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <header className={className ? `scene-toolbar ${className}` : "scene-toolbar"}>
      {children ? <div className="scene-toolbar-actions">{children}</div> : null}
    </header>
  );
}
