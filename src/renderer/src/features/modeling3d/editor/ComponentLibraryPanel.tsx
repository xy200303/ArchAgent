/** Renders only built-in components that have a complete scene-command workflow. */
import { BrickWall, Columns3, DoorOpen, Fence, MapPinned, PanelTop, PanelsTopLeft, type LucideIcon, PanelsTopLeft as WindowIcon, Waypoints } from "lucide-react";
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
  { id: "slab", label: "楼板", description: "矩形参数创建", icon: PanelsTopLeft },
  { id: "ceiling", label: "天花", description: "矩形参数创建", icon: PanelTop },
  { id: "column", label: "柱", description: "结构支撑", icon: Columns3 },
  { id: "zone", label: "房间", description: "功能分区", icon: MapPinned },
  { id: "stair", label: "楼梯", description: "直梯参数创建", icon: Waypoints },
  { id: "fence", label: "围栏", description: "原生边界构件", icon: Fence },
  { id: "door", label: "门", description: "绑定墙体开洞", icon: DoorOpen },
  { id: "window", label: "窗", description: "绑定墙体开洞", icon: WindowIcon }
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
      <p className="component-library-note">门窗均绑定墙体并经过洞口重叠校验，确保建筑关系始终可验证。</p>
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
