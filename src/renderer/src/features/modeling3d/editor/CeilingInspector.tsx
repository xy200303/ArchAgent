/** Edits rectangular ceilings through the same validated scene commands as other surfaces. */
import { PanelTop, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCeilingNode, SceneCommandInput, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SceneToolbar } from "./SceneToolbar";

type CeilingDraft = {
  name: string;
  originX: string;
  originY: string;
  width: string;
  depth: string;
  height: string;
  materialPreset: WallMaterialPreset;
};

const MATERIALS: WallMaterialPreset[] = ["white", "plaster", "wood", "tile", "concrete", "marble"];

export function CeilingInspector({ ceiling, onCreate, onUpdate, onDelete, onClose }: {
  ceiling?: SceneCeilingNode;
  onCreate: (command: Extract<SceneCommandInput, { type: "ceiling.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "ceiling.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(ceiling));

  useEffect(() => {
    setDraft(createDraft(ceiling));
  }, [ceiling]);

  function updateField(key: keyof CeilingDraft, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const payload = toCeilingPayload(draft);
    if (!payload) return;
    if (ceiling) onUpdate({ type: "ceiling.update", id: ceiling.id, ...payload });
    else onCreate({ type: "ceiling.create", parentId: "level_default", ...payload });
  }

  return (
    <aside className="scene-inspector" aria-label={ceiling ? "天花属性" : "新建天花"}>
      <SceneToolbar title={ceiling ? "天花属性" : "新建天花"} icon={PanelTop} className="scene-inspector-heading">
        <TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </TooltipButton>
      </SceneToolbar>
      <form className="wall-property-form" onSubmit={submit}>
        <label><span>名称</span><input value={draft.name} onChange={(event) => updateField("name", event.target.value)} required /></label>
        <div className="wall-property-grid">
          <label><span>起点 X</span><input type="number" step="0.1" value={draft.originX} onChange={(event) => updateField("originX", event.target.value)} required /></label>
          <label><span>起点 Y</span><input type="number" step="0.1" value={draft.originY} onChange={(event) => updateField("originY", event.target.value)} required /></label>
          <label><span>宽度</span><input type="number" min="0.1" step="0.1" value={draft.width} onChange={(event) => updateField("width", event.target.value)} required /></label>
          <label><span>进深</span><input type="number" min="0.1" step="0.1" value={draft.depth} onChange={(event) => updateField("depth", event.target.value)} required /></label>
          <label><span>高度</span><input type="number" min="0.1" step="0.1" value={draft.height} onChange={(event) => updateField("height", event.target.value)} required /></label>
        </div>
        <label><span>材质</span><select value={draft.materialPreset} onChange={(event) => updateField("materialPreset", event.target.value)}>{MATERIALS.map((material) => <option key={material} value={material}>{material}</option>)}</select></label>
        <div className="wall-property-actions"><button type="submit" className="primary-action"><Save size={15} />{ceiling ? "保存修改" : "创建天花"}</button>{ceiling ? <TooltipButton label="删除天花" className="scene-delete-wall-action" onClick={() => onDelete(ceiling.id)}><Trash2 size={16} /></TooltipButton> : null}</div>
      </form>
    </aside>
  );
}

function createDraft(ceiling?: SceneCeilingNode): CeilingDraft {
  const points = ceiling?.polygon ?? [[1, 1], [4, 1], [4, 4], [1, 4]];
  const xValues = points.map((point) => point[0]);
  const yValues = points.map((point) => point[1]);
  const minX = Math.min(...xValues);
  const minY = Math.min(...yValues);
  return { name: ceiling?.name ?? "新天花", originX: String(minX), originY: String(minY), width: String(Math.max(...xValues) - minX), depth: String(Math.max(...yValues) - minY), height: String(ceiling?.height ?? 2.8), materialPreset: ceiling?.materialPreset ?? "white" };
}

function toCeilingPayload(draft: CeilingDraft): Omit<SceneCeilingNode, "id" | "type" | "parentId"> | undefined {
  const [originX, originY, width, depth, height] = [draft.originX, draft.originY, draft.width, draft.depth, draft.height].map(Number);
  if (![originX, originY, width, depth, height].every(Number.isFinite) || width <= 0 || depth <= 0 || height <= 0) return undefined;
  return { name: draft.name.trim(), polygon: [[originX, originY], [originX + width, originY], [originX + width, originY + depth], [originX, originY + depth]], height, materialPreset: draft.materialPreset };
}
