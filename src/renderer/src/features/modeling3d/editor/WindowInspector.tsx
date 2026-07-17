/** Edits wall-hosted windows through the same validated opening command path. */
import { PanelsTopLeft, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneWallNode, SceneWindowNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SceneToolbar } from "./SceneToolbar";

type WindowDraft = { name: string; wallId: string; offset: string; width: string; height: string; sillHeight: string; materialPreset: WallMaterialPreset };

export function WindowInspector({ window, walls, onCreate, onUpdate, onDelete, onClose }: {
  window?: SceneWindowNode; walls: SceneWallNode[];
  onCreate: (command: Extract<SceneCommandInput, { type: "window.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "window.update" }>) => void;
  onDelete: (id: string) => void; onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(window, walls));
  useEffect(() => setDraft(createDraft(window, walls)), [window, walls]);
  const update = (key: keyof WindowDraft, value: string): void => setDraft((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const [offset, width, height, sillHeight] = [draft.offset, draft.width, draft.height, draft.sillHeight].map(Number);
    if (!draft.wallId || [offset, width, height, sillHeight].some((value) => !Number.isFinite(value))) return;
    const payload = { name: draft.name.trim(), offset, width, height, sillHeight, materialPreset: draft.materialPreset };
    if (window) onUpdate({ type: "window.update", id: window.id, ...payload });
    else onCreate({ type: "window.create", wallId: draft.wallId, ...payload });
  }
  return <aside className="scene-inspector" aria-label={window ? "窗属性" : "新建窗"}>
    <SceneToolbar title={window ? "窗属性" : "新建窗"} icon={PanelsTopLeft} className="scene-inspector-heading"><TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}><span aria-hidden="true">×</span></TooltipButton></SceneToolbar>
    <form className="wall-property-form" onSubmit={submit}>
      <label><span>名称</span><input value={draft.name} onChange={(event) => update("name", event.target.value)} required /></label>
      <label><span>宿主墙体</span><select value={draft.wallId} disabled={Boolean(window)} onChange={(event) => update("wallId", event.target.value)}>{walls.map((wall) => <option key={wall.id} value={wall.id}>{wall.name}</option>)}</select></label>
      <div className="wall-property-grid"><label><span>沿墙偏移</span><input type="number" min="0.05" step="0.01" value={draft.offset} onChange={(event) => update("offset", event.target.value)} required /></label><label><span>宽度</span><input type="number" min="0.1" step="0.01" value={draft.width} onChange={(event) => update("width", event.target.value)} required /></label><label><span>高度</span><input type="number" min="0.1" step="0.01" value={draft.height} onChange={(event) => update("height", event.target.value)} required /></label><label><span>窗台高度</span><input type="number" min="0" step="0.01" value={draft.sillHeight} onChange={(event) => update("sillHeight", event.target.value)} required /></label></div>
      <label><span>材质</span><select value={draft.materialPreset} onChange={(event) => update("materialPreset", event.target.value)}><option value="glass">玻璃</option><option value="wood">木材</option><option value="metal">金属</option><option value="white">白色</option></select></label>
      <div className="wall-property-actions"><button type="submit" className="primary-action"><Save size={15} />{window ? "保存修改" : "创建窗"}</button>{window ? <TooltipButton label="删除窗" className="scene-delete-wall-action" onClick={() => onDelete(window.id)}><Trash2 size={16} /></TooltipButton> : null}</div>
    </form>
  </aside>;
}

function createDraft(window: SceneWindowNode | undefined, walls: SceneWallNode[]): WindowDraft {
  return { name: window?.name ?? "新窗", wallId: window?.wallId ?? walls[0]?.id ?? "", offset: String(window?.offset ?? 1), width: String(window?.width ?? 1.2), height: String(window?.height ?? 1.2), sillHeight: String(window?.sillHeight ?? 0.9), materialPreset: window?.materialPreset ?? "glass" };
}
