/** Renders only built-in components that have a complete scene-command workflow. */
import { BrickWall, PanelsTopLeft, type LucideIcon } from "lucide-react";
import { memo, type JSX } from "react";
import type { BuiltInComponentId } from "./componentLibraryContracts";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel";

const AVAILABLE_COMPONENTS: Array<{
  id: BuiltInComponentId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "wall", label: "墙体", description: "参数创建", icon: BrickWall },
  { id: "slab", label: "楼板", description: "矩形参数创建", icon: PanelsTopLeft }
];

export const ComponentLibraryPanel = memo(function ComponentLibraryPanel({
  onSelectComponent
}: {
  onSelectComponent: (componentId: BuiltInComponentId) => void;
}): JSX.Element {
  return (
    <WorkspaceSidePanel label="构件库" className="component-library-sidebar">
      <section className="component-library-section" aria-labelledby="structure-components">
        <h3 id="structure-components">建筑结构</h3>
        <div className="component-library-grid">
          {AVAILABLE_COMPONENTS.map((component) => (
            <ComponentLibraryItem key={component.id} component={component} onSelectComponent={onSelectComponent} />
          ))}
        </div>
      </section>
      <p className="component-library-note">门窗将在墙洞关系校验完成后加入，避免创建无法验证的构件。</p>
    </WorkspaceSidePanel>
  );
});

function ComponentLibraryItem({
  component,
  onSelectComponent
}: {
  component: (typeof AVAILABLE_COMPONENTS)[number];
  onSelectComponent: (componentId: BuiltInComponentId) => void;
}): JSX.Element {
  const Icon = component.icon;
  return (
    <button type="button" className="component-library-item" onClick={() => onSelectComponent(component.id)}>
      <Icon size={20} />
      <span>{component.label}</span>
      <small>{component.description}</small>
    </button>
  );
}
