/** Creates and edits structural columns through the shared scene-command boundary. */
import { Columns3, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { ColumnCrossSection, SceneColumnNode, SceneCommandInput, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SceneToolbar } from "./SceneToolbar";

type ColumnDraft = { name: string; x: string; z: string; height: string; width: string; depth: string; crossSection: ColumnCrossSection; materialPreset: WallMaterialPreset };

export function ColumnInspector({ column, onCreate, onUpdate, onDelete, onClose }: {
  column?: SceneColumnNode;
  onCreate: (command: Extract<SceneCommandInput, { type: "column.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "column.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(column));
  useEffect(() => setDraft(createDraft(column)), [column]);
  const update = (key: keyof ColumnDraft, value: string): void => setDraft((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault(); const payload = toPayload(draft); if (!payload) return;
    if (column) onUpdate({ type: "column.update", id: column.id, ...payload }); else onCreate({ type: "column.create", parentId: "level_default", ...payload });
  }
  return <aside className="scene-inspector" aria-label={column ? "柱属性" : "新建柱"}><SceneToolbar title={column ? "柱属性" : "新建柱"} icon={Columns3} className="scene-inspector-heading"><TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}><span aria-hidden="true">×</span></TooltipButton></SceneToolbar><form className="wall-property-form" onSubmit={submit}><label><span>名称</span><input value={draft.name} onChange={(event) => update("name", event.target.value)} required /></label><div className="wall-property-grid"><label><span>X</span><input type="number" value={draft.x} onChange={(event) => update("x", event.target.value)} required /></label><label><span>Z</span><input type="number" value={draft.z} onChange={(event) => update("z", event.target.value)} required /></label><label><span>高度</span><input type="number" min="0.1" value={draft.height} onChange={(event) => update("height", event.target.value)} required /></label><label><span>宽度</span><input type="number" min="0.05" value={draft.width} onChange={(event) => update("width", event.target.value)} required /></label><label><span>进深</span><input type="number" min="0.05" value={draft.depth} onChange={(event) => update("depth", event.target.value)} required /></label></div><label><span>截面</span><select value={draft.crossSection} onChange={(event) => update("crossSection", event.target.value)}><option value="square">方形</option><option value="round">圆形</option><option value="rectangular">矩形</option></select></label><label><span>材质</span><select value={draft.materialPreset} onChange={(event) => update("materialPreset", event.target.value)}><option value="concrete">混凝土</option><option value="wood">木材</option><option value="metal">金属</option><option value="white">白色</option></select></label><div className="wall-property-actions"><button type="submit" className="primary-action"><Save size={15} />{column ? "保存修改" : "创建柱"}</button>{column ? <TooltipButton label="删除柱" className="scene-delete-wall-action" onClick={() => onDelete(column.id)}><Trash2 size={16} /></TooltipButton> : null}</div></form></aside>;
}
function createDraft(column?: SceneColumnNode): ColumnDraft { return { name: column?.name ?? "新柱", x: String(column?.position[0] ?? 2), z: String(column?.position[2] ?? 2), height: String(column?.height ?? 2.8), width: String(column?.width ?? 0.3), depth: String(column?.depth ?? 0.3), crossSection: column?.crossSection ?? "square", materialPreset: column?.materialPreset ?? "concrete" }; }
function toPayload(draft: ColumnDraft): Omit<SceneColumnNode, "id" | "type" | "parentId"> | undefined { const [x, z, height, width, depth] = [draft.x, draft.z, draft.height, draft.width, draft.depth].map(Number); if (![x, z, height, width, depth].every(Number.isFinite) || height <= 0 || width <= 0 || depth <= 0) return undefined; return { name: draft.name.trim(), position: [x, 0, z], height, width, depth, crossSection: draft.crossSection, materialPreset: draft.materialPreset }; }
