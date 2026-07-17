/** Provides navigation, real editor tools, and accessible wall property forms. */
import {
  BrickWall,
  Building2,
  ChevronDown,
  ChevronRight,
  Layers3,
  PanelsTopLeft,
  Save,
  Trash2
} from "lucide-react";
import { memo, useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneSlabNode, SceneSnapshot, SceneWallNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SceneToolbar } from "./SceneToolbar";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel";

const MATERIAL_OPTIONS: Array<{ value: WallMaterialPreset; label: string }> = [
  { value: "plaster", label: "抹灰" },
  { value: "brick", label: "砖" },
  { value: "concrete", label: "混凝土" },
  { value: "wood", label: "木材" },
  { value: "metal", label: "金属" },
  { value: "glass", label: "玻璃" },
  { value: "tile", label: "瓷砖" },
  { value: "marble", label: "大理石" },
  { value: "white", label: "白色" }
];

export const SceneNavigationPanel = memo(function SceneNavigationPanel({
  snapshot,
  selectedNodeId,
  onSelectNode
}: {
  snapshot: SceneSnapshot;
  selectedNodeId?: string;
  onSelectNode: (id: string) => void;
}): JSX.Element {
  return (
    <WorkspaceSidePanel label="编辑器导航" className="scene-navigation-panel">
      <SceneTreeContent snapshot={snapshot} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
    </WorkspaceSidePanel>
  );
});

function SceneTreeContent({
  snapshot,
  selectedNodeId,
  onSelectNode
}: {
  snapshot: SceneSnapshot;
  selectedNodeId?: string;
  onSelectNode: (id: string) => void;
}): JSX.Element {
  const [sceneOpen, setSceneOpen] = useState(true);
  const [buildingOpen, setBuildingOpen] = useState(true);
  const [levelOpen, setLevelOpen] = useState(true);
  const [wallsOpen, setWallsOpen] = useState(true);
  const level = Object.values(snapshot.nodes).find((node) => node.type === "level");
  const walls = Object.values(snapshot.nodes).filter((node): node is SceneWallNode => node.type === "wall");
  const slabs = Object.values(snapshot.nodes).filter((node): node is SceneSlabNode => node.type === "slab");

  return (
    <div className="scene-tree-panel" aria-label="场景树">
      <button
        type="button"
        className="scene-panel-heading scene-tree-toggle"
        aria-expanded={sceneOpen}
        aria-controls="scene-tree-root"
        onClick={() => setSceneOpen((open) => !open)}
      >
        {sceneOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Layers3 size={16} />
        <h2>场景</h2>
      </button>
      {sceneOpen ? (
        <div id="scene-tree-root" className="scene-tree-root">
          <button
            type="button"
            className="scene-tree-toggle"
            aria-expanded={buildingOpen}
            aria-controls="scene-tree-building"
            onClick={() => setBuildingOpen((open) => !open)}
          >
            {buildingOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Building2 size={15} />
            <span>主建筑</span>
          </button>
          {buildingOpen ? (
            <div id="scene-tree-building" className="scene-tree-branch">
              <button
                type="button"
                className="scene-tree-toggle"
                aria-expanded={levelOpen}
                aria-controls="scene-tree-level"
                onClick={() => setLevelOpen((open) => !open)}
              >
                {levelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Layers3 size={15} />
                <span>{level?.name ?? "楼层"}</span>
              </button>
              {levelOpen ? (
                <div id="scene-tree-level" className="scene-tree-branch">
                  <button
                    type="button"
                    className="scene-tree-toggle"
                    aria-expanded={wallsOpen}
                    aria-controls="scene-tree-walls"
                    onClick={() => setWallsOpen((open) => !open)}
                  >
                    {wallsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <BrickWall size={15} />
                    <span>建筑构件</span>
                  </button>
                  {wallsOpen ? (
                    <div id="scene-tree-walls" className="scene-tree-group">
                      {walls.map((wall) => (
                        <button
                          key={wall.id}
                          type="button"
                          className={wall.id === selectedNodeId ? "scene-tree-node selected" : "scene-tree-node"}
                          aria-pressed={wall.id === selectedNodeId}
                          onClick={() => onSelectNode(wall.id)}
                        >
                          <BrickWall size={14} />
                          <span>{wall.name}</span>
                        </button>
                      ))}
                      {slabs.map((slab) => (
                        <button
                          key={slab.id}
                          type="button"
                          className={slab.id === selectedNodeId ? "scene-tree-node selected" : "scene-tree-node"}
                          aria-pressed={slab.id === selectedNodeId}
                          onClick={() => onSelectNode(slab.id)}
                        >
                          <PanelsTopLeft size={14} />
                          <span>{slab.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const WallInspector = memo(function WallInspector({
  wall,
  onCreate,
  onUpdate,
  onDelete,
  onClose
}: {
  wall?: SceneWallNode;
  onCreate: (command: Extract<SceneCommandInput, { type: "wall.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "wall.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(wall));

  useEffect(() => {
    setDraft(createDraft(wall));
  }, [wall]);

  function updateField(key: keyof WallDraft, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const payload = toWallPayload(draft);
    if (!payload) return;
    if (wall) {
      onUpdate({ type: "wall.update", id: wall.id, ...payload });
    } else {
      onCreate({ type: "wall.create", parentId: "level_default", ...payload });
    }
  }

  return (
    <aside className="scene-inspector" aria-label={wall ? "墙体属性" : "新建墙体"}>
      <SceneToolbar
        title={wall ? "墙体属性" : "新建墙体"}
        icon={BrickWall}
        className="scene-inspector-heading"
      >
        <TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </TooltipButton>
      </SceneToolbar>
      <form className="wall-property-form" onSubmit={submit}>
        <label>
          <span>名称</span>
          <input value={draft.name} onChange={(event) => updateField("name", event.target.value)} required />
        </label>
        <div className="wall-property-grid">
          <label>
            <span>起点 X</span>
            <input type="number" step="0.1" value={draft.startX} onChange={(event) => updateField("startX", event.target.value)} required />
          </label>
          <label>
            <span>起点 Y</span>
            <input type="number" step="0.1" value={draft.startY} onChange={(event) => updateField("startY", event.target.value)} required />
          </label>
          <label>
            <span>终点 X</span>
            <input type="number" step="0.1" value={draft.endX} onChange={(event) => updateField("endX", event.target.value)} required />
          </label>
          <label>
            <span>终点 Y</span>
            <input type="number" step="0.1" value={draft.endY} onChange={(event) => updateField("endY", event.target.value)} required />
          </label>
          <label>
            <span>高度</span>
            <input type="number" min="0.01" step="0.01" value={draft.height} onChange={(event) => updateField("height", event.target.value)} required />
          </label>
          <label>
            <span>厚度</span>
            <input type="number" min="0.01" step="0.01" value={draft.thickness} onChange={(event) => updateField("thickness", event.target.value)} required />
          </label>
        </div>
        <label>
          <span>材质</span>
          <select value={draft.materialPreset} onChange={(event) => updateField("materialPreset", event.target.value)}>
            {MATERIAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="wall-property-actions">
          <button type="submit" className="primary-action"><Save size={15} /> {wall ? "保存修改" : "创建墙体"}</button>
          {wall ? (
            <TooltipButton label="删除墙体" className="scene-delete-wall-action" onClick={() => onDelete(wall.id)}>
              <Trash2 size={16} />
            </TooltipButton>
          ) : null}
        </div>
      </form>
    </aside>
  );
});

type WallDraft = {
  name: string;
  startX: string;
  startY: string;
  endX: string;
  endY: string;
  height: string;
  thickness: string;
  materialPreset: WallMaterialPreset;
};

function createDraft(wall?: SceneWallNode): WallDraft {
  return {
    name: wall?.name ?? "新墙体",
    startX: String(wall?.start[0] ?? 1),
    startY: String(wall?.start[1] ?? 1),
    endX: String(wall?.end[0] ?? 3),
    endY: String(wall?.end[1] ?? 1),
    height: String(wall?.height ?? 2.8),
    thickness: String(wall?.thickness ?? 0.2),
    materialPreset: wall?.materialPreset ?? "plaster"
  };
}

function toWallPayload(draft: WallDraft): Omit<SceneWallNode, "id" | "type" | "parentId"> | undefined {
  const values = [draft.startX, draft.startY, draft.endX, draft.endY, draft.height, draft.thickness].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return undefined;
  return {
    name: draft.name.trim(),
    start: [values[0], values[1]],
    end: [values[2], values[3]],
    height: values[4],
    thickness: values[5],
    materialPreset: draft.materialPreset
  };
}
