/** Edits wall-hosted doors and keeps all opening dimensions on the shared command path. */
import { DoorOpen, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneDoorNode, SceneWallNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SceneToolbar } from "./SceneToolbar";

type DoorDraft = { name: string; wallId: string; offset: string; width: string; height: string; sillHeight: string; materialPreset: WallMaterialPreset };
const MATERIALS: WallMaterialPreset[] = ["wood", "metal", "glass", "white"];

export function DoorInspector({ door, walls, onCreate, onUpdate, onDelete, onClose }: {
  door?: SceneDoorNode; walls: SceneWallNode[];
  onCreate: (command: Extract<SceneCommandInput, { type: "door.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "door.update" }>) => void;
  onDelete: (id: string) => void; onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(door, walls));
  useEffect(() => setDraft(createDraft(door, walls)), [door, walls]);
  const update = (key: keyof DoorDraft, value: string): void => setDraft((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const values = [draft.offset, draft.width, draft.height, draft.sillHeight].map(Number);
    if (!draft.wallId || values.some((value) => !Number.isFinite(value))) return;
    const payload = { name: draft.name.trim(), offset: values[0], width: values[1], height: values[2], sillHeight: values[3], materialPreset: draft.materialPreset };
    if (door) onUpdate({ type: "door.update", id: door.id, ...payload });
    else onCreate({ type: "door.create", wallId: draft.wallId, ...payload });
  }
  return <aside className="scene-inspector" aria-label={door ? "门属性" : "新建门"}>
    <SceneToolbar title={door ? "门属性" : "新建门"} icon={DoorOpen} className="scene-inspector-heading"><TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}><span aria-hidden="true">×</span></TooltipButton></SceneToolbar>
    <form className="wall-property-form" onSubmit={submit}>
      <label><span>名称</span><input value={draft.name} onChange={(event) => update("name", event.target.value)} required /></label>
      <label><span>宿主墙体</span><select value={draft.wallId} disabled={Boolean(door)} onChange={(event) => update("wallId", event.target.value)}>{walls.map((wall) => <option key={wall.id} value={wall.id}>{wall.name}</option>)}</select></label>
      <div className="wall-property-grid">
        <label><span>沿墙偏移</span><input type="number" min="0.05" step="0.01" value={draft.offset} onChange={(event) => update("offset", event.target.value)} required /></label>
        <label><span>宽度</span><input type="number" min="0.1" step="0.01" value={draft.width} onChange={(event) => update("width", event.target.value)} required /></label>
        <label><span>高度</span><input type="number" min="0.1" step="0.01" value={draft.height} onChange={(event) => update("height", event.target.value)} required /></label>
        <label><span>离地高度</span><input type="number" min="0" step="0.01" value={draft.sillHeight} onChange={(event) => update("sillHeight", event.target.value)} required /></label>
      </div>
      <label><span>材质</span><select value={draft.materialPreset} onChange={(event) => update("materialPreset", event.target.value)}>{MATERIALS.map((material) => <option key={material} value={material}>{material}</option>)}</select></label>
      <div className="wall-property-actions"><button type="submit" className="primary-action"><Save size={15} />{door ? "保存修改" : "创建门"}</button>{door ? <TooltipButton label="删除门" className="scene-delete-wall-action" onClick={() => onDelete(door.id)}><Trash2 size={16} /></TooltipButton> : null}</div>
    </form>
  </aside>;
}

function createDraft(door: SceneDoorNode | undefined, walls: SceneWallNode[]): DoorDraft {
  return { name: door?.name ?? "新门", wallId: door?.wallId ?? walls[0]?.id ?? "", offset: String(door?.offset ?? 1), width: String(door?.width ?? 0.9), height: String(door?.height ?? 2.1), sillHeight: String(door?.sillHeight ?? 0), materialPreset: door?.materialPreset ?? "wood" };
}
