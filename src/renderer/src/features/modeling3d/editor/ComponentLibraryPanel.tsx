/** Renders only built-in components that have a complete scene-command workflow. */
import { Blocks, BrickWall } from "lucide-react";
import type { JSX } from "react";
import type { BuiltInComponentId } from "./componentLibraryContracts";

const AVAILABLE_COMPONENTS: Array<{
  id: BuiltInComponentId;
  label: string;
  description: string;
}> = [
  { id: "wall", label: "墙体", description: "参数创建" }
];

export function ComponentLibraryPanel({
  onSelectComponent
}: {
  onSelectComponent: (componentId: BuiltInComponentId) => void;
}): JSX.Element {
  return (
    <aside className="component-library-sidebar" aria-label="构件库">
      <header className="component-library-header">
        <Blocks size={17} />
        <h2>构件库</h2>
      </header>
      <section className="component-library-section" aria-labelledby="structure-components">
        <h3 id="structure-components">建筑结构</h3>
        <div className="component-library-grid">
          {AVAILABLE_COMPONENTS.map((component) => (
            <button
              key={component.id}
              type="button"
              className="component-library-item"
              onClick={() => onSelectComponent(component.id)}
            >
              <BrickWall size={20} />
              <span>{component.label}</span>
              <small>{component.description}</small>
            </button>
          ))}
        </div>
      </section>
      <p className="component-library-note">新的内置模型会在完成创建、渲染和属性编辑后加入。</p>
    </aside>
  );
}
