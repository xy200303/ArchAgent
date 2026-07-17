/** Creates and edits Pascal-native boundary fences through the scene command boundary. */
import { Fence, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { FenceStyle, SceneCommandInput, SceneFenceNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SceneToolbar } from "./SceneToolbar";

type FenceDraft = {
  name: string;
  startX: string;
  startZ: string;
  endX: string;
  endZ: string;
  height: string;
  thickness: string;
  style: FenceStyle;
  materialPreset: WallMaterialPreset;
};

const MATERIAL_OPTIONS: Array<{ value: WallMaterialPreset; label: string }> = [
  { value: "metal", label: "金属" },
  { value: "wood", label: "木材" },
  { value: "concrete", label: "混凝土" },
  { value: "white", label: "白色" }
];

export function FenceInspector({
  fence,
  onCreate,
  onUpdate,
  onDelete,
  onClose
}: {
  fence?: SceneFenceNode;
  onCreate: (command: Extract<SceneCommandInput, { type: "fence.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "fence.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(fence));

  useEffect(() => {
    setDraft(createDraft(fence));
  }, [fence]);

  function updateField(key: keyof FenceDraft, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const payload = toFencePayload(draft);
    if (!payload) return;

    if (fence) onUpdate({ type: "fence.update", id: fence.id, ...payload });
    else onCreate({ type: "fence.create", parentId: "level_default", ...payload });
  }

  return (
    <aside className="scene-inspector" aria-label={fence ? "围栏属性" : "新建围栏"}>
      <SceneToolbar title={fence ? "围栏属性" : "新建围栏"} icon={Fence} className="scene-inspector-heading">
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
          <NumberField label="起点 X" value={draft.startX} onChange={(value) => updateField("startX", value)} />
          <NumberField label="起点 Z" value={draft.startZ} onChange={(value) => updateField("startZ", value)} />
          <NumberField label="终点 X" value={draft.endX} onChange={(value) => updateField("endX", value)} />
          <NumberField label="终点 Z" value={draft.endZ} onChange={(value) => updateField("endZ", value)} />
          <NumberField label="高度" value={draft.height} min="0.1" onChange={(value) => updateField("height", value)} />
          <NumberField label="厚度" value={draft.thickness} min="0.01" onChange={(value) => updateField("thickness", value)} />
        </div>
        <label>
          <span>样式</span>
          <select value={draft.style} onChange={(event) => updateField("style", event.target.value)}>
            <option value="slat">格栅</option>
            <option value="rail">横杆</option>
            <option value="privacy">实体</option>
          </select>
        </label>
        <label>
          <span>材质</span>
          <select value={draft.materialPreset} onChange={(event) => updateField("materialPreset", event.target.value)}>
            {MATERIAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="wall-property-actions">
          <button type="submit" className="primary-action"><Save size={15} />{fence ? "保存修改" : "创建围栏"}</button>
          {fence ? (
            <TooltipButton label="删除围栏" className="scene-delete-wall-action" onClick={() => onDelete(fence.id)}>
              <Trash2 size={16} />
            </TooltipButton>
          ) : null}
        </div>
      </form>
    </aside>
  );
}

function NumberField({ label, value, min, onChange }: { label: string; value: string; min?: string; onChange: (value: string) => void }): JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <input type="number" min={min} step="0.1" value={value} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}

function createDraft(fence?: SceneFenceNode): FenceDraft {
  return {
    name: fence?.name ?? "新围栏",
    startX: String(fence?.start[0] ?? 1),
    startZ: String(fence?.start[1] ?? 1),
    endX: String(fence?.end[0] ?? 4),
    endZ: String(fence?.end[1] ?? 1),
    height: String(fence?.height ?? 1.1),
    thickness: String(fence?.thickness ?? 0.08),
    style: fence?.style ?? "slat",
    materialPreset: fence?.materialPreset ?? "metal"
  };
}

function toFencePayload(draft: FenceDraft): Omit<SceneFenceNode, "id" | "type" | "parentId"> | undefined {
  const [startX, startZ, endX, endZ, height, thickness] = [
    draft.startX,
    draft.startZ,
    draft.endX,
    draft.endZ,
    draft.height,
    draft.thickness
  ].map(Number);
  if (![startX, startZ, endX, endZ, height, thickness].every(Number.isFinite) || height <= 0 || thickness <= 0) return undefined;

  return {
    name: draft.name.trim(),
    start: [startX, startZ],
    end: [endX, endZ],
    height,
    thickness,
    style: draft.style,
    materialPreset: draft.materialPreset
  };
}
