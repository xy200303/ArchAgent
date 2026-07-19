/** Creates and edits straight stairs through the shared scene-command boundary. */
import { Save, Trash2, Waypoints } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneStairNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SidePanelHeader } from "../../../shared/SidePanelHeader";

type StairDraft = {
  name: string;
  x: string;
  z: string;
  rotation: string;
  width: string;
  rise: string;
  steps: string;
  thickness: string;
  railingMode: SceneStairNode["railingMode"];
  materialPreset: WallMaterialPreset;
};

const MATERIAL_OPTIONS: Array<{ value: WallMaterialPreset; label: string }> = [
  { value: "concrete", label: "混凝土" },
  { value: "wood", label: "木材" },
  { value: "metal", label: "金属" },
  { value: "tile", label: "瓷砖" }
];

export function StairInspector({
  stair,
  onCreate,
  onUpdate,
  onDelete,
  onClose
}: {
  stair?: SceneStairNode;
  onCreate: (command: Extract<SceneCommandInput, { type: "stair.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "stair.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(stair));

  useEffect(() => {
    setDraft(createDraft(stair));
  }, [stair]);

  function updateField(key: keyof StairDraft, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const payload = toStairPayload(draft);
    if (!payload) return;

    if (stair) onUpdate({ type: "stair.update", id: stair.id, ...payload });
    else onCreate({ type: "stair.create", parentId: "level_default", ...payload });
  }

  return (
    <aside className="scene-inspector" aria-label={stair ? "楼梯属性" : "新建楼梯"}>
      <SidePanelHeader title={stair ? "楼梯属性" : "新建楼梯"} icon={Waypoints} actions={<TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </TooltipButton>} />
      <form className="wall-property-form" onSubmit={submit}>
        <label>
          <span>名称</span>
          <input value={draft.name} onChange={(event) => updateField("name", event.target.value)} required />
        </label>
        <div className="wall-property-grid">
          <NumberField label="X" value={draft.x} onChange={(value) => updateField("x", value)} />
          <NumberField label="Z" value={draft.z} onChange={(value) => updateField("z", value)} />
          <NumberField label="方向（弧度）" value={draft.rotation} onChange={(value) => updateField("rotation", value)} />
          <NumberField label="宽度" value={draft.width} min="0.1" onChange={(value) => updateField("width", value)} />
          <NumberField label="总高度" value={draft.rise} min="0.1" onChange={(value) => updateField("rise", value)} />
          <NumberField label="踏步数" value={draft.steps} min="2" step="1" onChange={(value) => updateField("steps", value)} />
          <NumberField label="板厚" value={draft.thickness} min="0.01" onChange={(value) => updateField("thickness", value)} />
        </div>
        <label>
          <span>扶手</span>
          <select value={draft.railingMode} onChange={(event) => updateField("railingMode", event.target.value)}>
            <option value="both">双侧</option>
            <option value="left">左侧</option>
            <option value="right">右侧</option>
            <option value="none">无</option>
          </select>
        </label>
        <label>
          <span>材质</span>
          <select value={draft.materialPreset} onChange={(event) => updateField("materialPreset", event.target.value)}>
            {MATERIAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="wall-property-actions">
          <button type="submit" className="primary-action"><Save size={15} />{stair ? "保存修改" : "创建楼梯"}</button>
          {stair ? (
            <TooltipButton label="删除楼梯" className="scene-delete-wall-action" onClick={() => onDelete(stair.id)}>
              <Trash2 size={16} />
            </TooltipButton>
          ) : null}
        </div>
      </form>
    </aside>
  );
}

function NumberField({
  label,
  value,
  min,
  step = "0.1",
  onChange
}: {
  label: string;
  value: string;
  min?: string;
  step?: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <input type="number" min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}

function createDraft(stair?: SceneStairNode): StairDraft {
  return {
    name: stair?.name ?? "新楼梯",
    x: String(stair?.position[0] ?? 1),
    z: String(stair?.position[2] ?? 1),
    rotation: String(stair?.rotation ?? 0),
    width: String(stair?.width ?? 1.1),
    rise: String(stair?.totalRise ?? 2.8),
    steps: String(stair?.stepCount ?? 16),
    thickness: String(stair?.thickness ?? 0.16),
    railingMode: stair?.railingMode ?? "both",
    materialPreset: stair?.materialPreset ?? "concrete"
  };
}

function toStairPayload(draft: StairDraft): Omit<SceneStairNode, "id" | "type" | "parentId"> | undefined {
  const [x, z, rotation, width, totalRise, stepCount, thickness] = [
    draft.x,
    draft.z,
    draft.rotation,
    draft.width,
    draft.rise,
    draft.steps,
    draft.thickness
  ].map(Number);
  if (![x, z, rotation, width, totalRise, stepCount, thickness].every(Number.isFinite)) return undefined;
  if (width <= 0 || totalRise <= 0 || thickness <= 0 || !Number.isInteger(stepCount) || stepCount < 2) return undefined;

  return {
    name: draft.name.trim(),
    position: [x, 0, z],
    rotation,
    width,
    totalRise,
    stepCount,
    thickness,
    railingMode: draft.railingMode,
    materialPreset: draft.materialPreset
  };
}
