/** Provides navigation, real editor tools, and accessible wall property forms. */
import {
  BrickWall,
  Building2,
  Eye,
  Layers3,
  MousePointer2,
  PencilRuler,
  Plus,
  RotateCcw,
  Save,
  Square,
  Trash2
} from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneSnapshot, SceneWallNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import type { CameraPreset } from "../viewport/cameraPresets";

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

export function SceneNavigationPanel({
  snapshot,
  selectedWallId,
  onSelectWall
}: {
  snapshot: SceneSnapshot;
  selectedWallId?: string;
  onSelectWall: (id: string) => void;
}): JSX.Element {
  return (
    <aside className="scene-navigation-panel" aria-label="编辑器导航">
      <SceneTreeContent snapshot={snapshot} selectedWallId={selectedWallId} onSelectWall={onSelectWall} />
    </aside>
  );
}

function SceneTreeContent({
  snapshot,
  selectedWallId,
  onSelectWall
}: {
  snapshot: SceneSnapshot;
  selectedWallId?: string;
  onSelectWall: (id: string) => void;
}): JSX.Element {
  const level = Object.values(snapshot.nodes).find((node) => node.type === "level");
  const walls = Object.values(snapshot.nodes).filter((node): node is SceneWallNode => node.type === "wall");

  return (
    <div className="scene-tree-panel" aria-label="场景树">
      <div className="scene-panel-heading">
        <Layers3 size={16} />
        <h2>场景</h2>
      </div>
      <div className="scene-tree-root">
        <span><Building2 size={15} /> 主建筑</span>
        <span className="scene-tree-level"><Layers3 size={15} /> {level?.name ?? "楼层"}</span>
        <div className="scene-tree-group">
          <span className="scene-tree-group-title"><BrickWall size={15} /> 墙体</span>
          {walls.map((wall) => (
            <button
              key={wall.id}
              type="button"
              className={wall.id === selectedWallId ? "scene-tree-node selected" : "scene-tree-node"}
              aria-pressed={wall.id === selectedWallId}
              onClick={() => onSelectWall(wall.id)}
            >
              <BrickWall size={14} />
              <span>{wall.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SceneToolbar({
  wallDrawingActive,
  onToggleWallDrawing,
  onSelectTool,
  onCreateWall,
  onCameraPreset,
  componentLibraryOpen
}: {
  wallDrawingActive: boolean;
  onToggleWallDrawing: () => void;
  onSelectTool: () => void;
  onCreateWall: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  componentLibraryOpen: boolean;
}): JSX.Element {
  return (
    <header className={componentLibraryOpen ? "scene-editor-toolbar library-mode" : "scene-editor-toolbar"}>
      {componentLibraryOpen ? null : (
        <div className="scene-toolbar-document">
          <strong>空间编辑器</strong>
          <span>主建筑 / 首层</span>
        </div>
      )}
      <div className="scene-toolbar-tools" role="toolbar" aria-label="建模工具">
        <TooltipButton
          label="选择工具"
          className={wallDrawingActive ? "scene-tool-button" : "scene-tool-button active"}
          onClick={onSelectTool}
          pressed={!wallDrawingActive}
        >
          <MousePointer2 size={17} />
        </TooltipButton>
        <TooltipButton
          label={wallDrawingActive ? "取消绘制墙体" : "绘制墙体"}
          className={wallDrawingActive ? "scene-tool-button active" : "scene-tool-button"}
          onClick={onToggleWallDrawing}
          pressed={wallDrawingActive}
        >
          <PencilRuler size={17} />
        </TooltipButton>
      </div>
      <div className="scene-toolbar-viewport" role="toolbar" aria-label="视图控制">
        <TooltipButton label="透视视图" className="scene-tool-button" onClick={() => onCameraPreset("perspective")}>
          <Eye size={17} />
        </TooltipButton>
        <TooltipButton label="顶视图" className="scene-tool-button" onClick={() => onCameraPreset("top")}>
          <Square size={17} />
        </TooltipButton>
        <TooltipButton label="正视图" className="scene-tool-button" onClick={() => onCameraPreset("front")}>
          <Building2 size={17} />
        </TooltipButton>
        <TooltipButton label="右视图" className="scene-tool-button" onClick={() => onCameraPreset("right")}>
          <Layers3 size={17} />
        </TooltipButton>
        <TooltipButton label="重置相机" className="scene-tool-button" onClick={() => onCameraPreset("reset")}>
          <RotateCcw size={17} />
        </TooltipButton>
        <button type="button" className="secondary-action scene-create-wall-action" onClick={onCreateWall}>
          <Plus size={16} />
          参数创建
        </button>
      </div>
    </header>
  );
}

export function WallInspector({
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
      <div className="scene-panel-heading scene-inspector-heading">
        <div><BrickWall size={16} /> <h2>{wall ? "墙体属性" : "新建墙体"}</h2></div>
        <TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </TooltipButton>
      </div>
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
}

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
