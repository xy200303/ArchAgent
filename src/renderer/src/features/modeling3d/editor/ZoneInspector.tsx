/** Edits rectangular functional zones through the shared scene-command boundary. */
import { MapPinned, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneZoneNode } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SidePanelHeader } from "../../../shared/SidePanelHeader";

type ZoneDraft = {
  name: string;
  x: string;
  z: string;
  width: string;
  depth: string;
  color: string;
};

export function ZoneInspector({
  zone,
  onCreate,
  onUpdate,
  onDelete,
  onClose
}: {
  zone?: SceneZoneNode;
  onCreate: (command: Extract<SceneCommandInput, { type: "zone.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "zone.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(zone));

  useEffect(() => {
    setDraft(createDraft(zone));
  }, [zone]);

  function updateField(key: keyof ZoneDraft, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const payload = toZonePayload(draft);
    if (!payload) return;

    if (zone) onUpdate({ type: "zone.update", id: zone.id, ...payload });
    else onCreate({ type: "zone.create", parentId: "level_default", ...payload });
  }

  return (
    <aside className="scene-inspector" aria-label={zone ? "房间属性" : "新建房间"}>
      <SidePanelHeader title={zone ? "房间属性" : "新建房间"} icon={MapPinned} actions={<TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </TooltipButton>} />
      <form className="wall-property-form" onSubmit={submit}>
        <label>
          <span>名称</span>
          <input value={draft.name} onChange={(event) => updateField("name", event.target.value)} required />
        </label>
        <div className="wall-property-grid">
          <NumberField label="起点 X" value={draft.x} onChange={(value) => updateField("x", value)} />
          <NumberField label="起点 Z" value={draft.z} onChange={(value) => updateField("z", value)} />
          <NumberField label="宽度" value={draft.width} min="0.1" onChange={(value) => updateField("width", value)} />
          <NumberField label="进深" value={draft.depth} min="0.1" onChange={(value) => updateField("depth", value)} />
          <label>
            <span>颜色</span>
            <input type="color" value={draft.color} onChange={(event) => updateField("color", event.target.value)} required />
          </label>
        </div>
        <div className="wall-property-actions">
          <button type="submit" className="primary-action"><Save size={15} />{zone ? "保存修改" : "创建房间"}</button>
          {zone ? (
            <TooltipButton label="删除房间" className="scene-delete-wall-action" onClick={() => onDelete(zone.id)}>
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

function createDraft(zone?: SceneZoneNode): ZoneDraft {
  const points = zone?.polygon ?? [[1, 1], [4, 1], [4, 4], [1, 4]];
  const xValues = points.map((point) => point[0]);
  const zValues = points.map((point) => point[1]);
  const x = Math.min(...xValues);
  const z = Math.min(...zValues);

  return {
    name: zone?.name ?? "新房间",
    x: String(x),
    z: String(z),
    width: String(Math.max(...xValues) - x),
    depth: String(Math.max(...zValues) - z),
    color: zone?.color ?? "#0f6cbd"
  };
}

function toZonePayload(draft: ZoneDraft): Omit<SceneZoneNode, "id" | "type" | "parentId"> | undefined {
  const [x, z, width, depth] = [draft.x, draft.z, draft.width, draft.depth].map(Number);
  if (![x, z, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return undefined;
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) return undefined;

  return {
    name: draft.name.trim(),
    polygon: [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]],
    color: draft.color
  };
}
