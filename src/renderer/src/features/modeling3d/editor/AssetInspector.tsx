/** Edits the placement of an imported reference mesh without exposing mesh topology. */
import { Box, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneAssetNode, SceneCommandInput } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SidePanelHeader } from "../../../shared/SidePanelHeader";

type AssetDraft = {
  name: string;
  position: [string, string, string];
  rotation: [string, string, string];
  scale: [string, string, string];
  targetDimensions: [string, string, string];
};

export function AssetInspector({ asset, onUpdate, onDelete, onClose }: {
  asset: SceneAssetNode;
  onUpdate: (command: Extract<SceneCommandInput, { type: "asset.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(asset));

  useEffect(() => { setDraft(createDraft(asset)); }, [asset]);

  function setVectorValue(field: "position" | "rotation" | "scale" | "targetDimensions", index: number, value: string): void {
    setDraft((current) => {
      const next = [...current[field]] as AssetDraft[typeof field];
      next[index] = value;
      return { ...current, [field]: next };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const payload = toAssetUpdate(draft);
    if (payload) onUpdate({ type: "asset.update", id: asset.id, ...payload });
  }

  return (
    <aside className="scene-inspector" aria-label="参考模型属性">
      <SidePanelHeader title="参考模型属性" icon={Box} actions={<TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}><span aria-hidden="true">×</span></TooltipButton>} />
      <form className="wall-property-form" onSubmit={submit}>
        <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required /></label>
        <p className="asset-inspector-format">{asset.format.toUpperCase()} 参考模型 · 不支持 Mesh 级编辑</p>
        <VectorFields title="位置（m）" value={draft.position} axes={["X", "Y", "Z"]} onChange={(index, value) => setVectorValue("position", index, value)} />
        <VectorFields title="旋转（°）" value={draft.rotation} axes={["X", "Y", "Z"]} onChange={(index, value) => setVectorValue("rotation", index, value)} />
        <VectorFields title="缩放" value={draft.scale} axes={["X", "Y", "Z"]} min="0.01" onChange={(index, value) => setVectorValue("scale", index, value)} />
        <VectorFields title="目标尺寸（m，自动校准网格）" value={draft.targetDimensions} axes={["宽", "高", "深"]} min="0.001" optional onChange={(index, value) => setVectorValue("targetDimensions", index, value)} />
        <div className="wall-property-actions">
          <button type="submit" className="primary-action"><Save size={15} />保存位置</button>
          <TooltipButton label="删除参考模型" className="scene-delete-wall-action" onClick={() => onDelete(asset.id)}><Trash2 size={16} /></TooltipButton>
        </div>
      </form>
    </aside>
  );
}

function VectorFields({ title, value, axes, min, optional = false, onChange }: { title: string; value: [string, string, string]; axes: [string, string, string]; min?: string; optional?: boolean; onChange: (index: number, value: string) => void }): JSX.Element {
  return <fieldset className="asset-vector-fields"><legend>{title}</legend><div className="wall-property-grid">{value.map((item, index) => <label key={axes[index]}><span>{axes[index]}</span><input type="number" min={min} step="0.1" value={item} onChange={(event) => onChange(index, event.target.value)} required={!optional} /></label>)}</div></fieldset>;
}

function createDraft(asset: SceneAssetNode): AssetDraft {
  return { name: asset.name, position: asset.position.map(String) as AssetDraft["position"], rotation: asset.rotation.map((value) => toDegrees(String(value))) as AssetDraft["rotation"], scale: asset.scale.map(String) as AssetDraft["scale"], targetDimensions: asset.targetDimensions?.map(String) as AssetDraft["targetDimensions"] ?? ["", "", ""] };
}

function toAssetUpdate(draft: AssetDraft): Omit<Extract<SceneCommandInput, { type: "asset.update" }>, "type" | "id"> | undefined {
  const position = toVector(draft.position);
  const rotationDegrees = toVector(draft.rotation);
  const scale = toVector(draft.scale);
  const targetDimensions = toOptionalVector(draft.targetDimensions);
  if (!position || !rotationDegrees || !scale || targetDimensions === null || scale.some((value) => value <= 0) || !draft.name.trim()) return undefined;
  return { name: draft.name.trim(), position, rotation: rotationDegrees.map(toRadians) as [number, number, number], scale, ...(targetDimensions ? { targetDimensions } : {}) };
}

function toVector(value: [string, string, string]): [number, number, number] | undefined {
  const parsed = value.map(Number);
  return parsed.every(Number.isFinite) ? parsed as [number, number, number] : undefined;
}

function toOptionalVector(value: [string, string, string]): [number, number, number] | undefined | null {
  if (!value.some((item) => item.trim())) return undefined;
  const vector = toVector(value);
  return vector && vector.every((item) => item > 0) ? vector : null;
}

function toDegrees(value: string): string { return (Number(value) * 180 / Math.PI).toFixed(1); }
function toRadians(value: number): number { return value * Math.PI / 180; }
