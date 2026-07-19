/** Edits a rectangular slab through the same validated scene commands as the component library. */
import { PanelsTopLeft, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneSlabNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SidePanelHeader } from "../../../shared/SidePanelHeader";

const MATERIAL_OPTIONS: Array<{ value: WallMaterialPreset; label: string }> = [
  { value: "concrete", label: "混凝土" },
  { value: "tile", label: "瓷砖" },
  { value: "wood", label: "木材" },
  { value: "marble", label: "大理石" },
  { value: "plaster", label: "抹灰" },
  { value: "white", label: "白色" }
];

type SlabDraft = {
  name: string;
  originX: string;
  originY: string;
  width: string;
  depth: string;
  elevation: string;
  materialPreset: WallMaterialPreset;
};

export function SlabInspector({
  slab,
  onCreate,
  onUpdate,
  onDelete,
  onClose
}: {
  slab?: SceneSlabNode;
  onCreate: (command: Extract<SceneCommandInput, { type: "slab.create" }>) => void;
  onUpdate: (command: Extract<SceneCommandInput, { type: "slab.update" }>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createDraft(slab));

  useEffect(() => {
    setDraft(createDraft(slab));
  }, [slab]);

  function updateField(key: keyof SlabDraft, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const payload = toSlabPayload(draft);
    if (!payload) return;
    if (slab) {
      onUpdate({ type: "slab.update", id: slab.id, ...payload });
      return;
    }
    onCreate({ type: "slab.create", parentId: "level_default", ...payload });
  }

  return (
    <aside className="scene-inspector" aria-label={slab ? "楼板属性" : "新建楼板"}>
      <SidePanelHeader title={slab ? "楼板属性" : "新建楼板"} icon={PanelsTopLeft} actions={<TooltipButton label="关闭属性面板" className="scene-inspector-close" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </TooltipButton>} />
      <form className="wall-property-form" onSubmit={submit}>
        <label>
          <span>名称</span>
          <input value={draft.name} onChange={(event) => updateField("name", event.target.value)} required />
        </label>
        <div className="wall-property-grid">
          <label>
            <span>起点 X</span>
            <input type="number" step="0.1" value={draft.originX} onChange={(event) => updateField("originX", event.target.value)} required />
          </label>
          <label>
            <span>起点 Y</span>
            <input type="number" step="0.1" value={draft.originY} onChange={(event) => updateField("originY", event.target.value)} required />
          </label>
          <label>
            <span>宽度</span>
            <input type="number" min="0.1" step="0.1" value={draft.width} onChange={(event) => updateField("width", event.target.value)} required />
          </label>
          <label>
            <span>进深</span>
            <input type="number" min="0.1" step="0.1" value={draft.depth} onChange={(event) => updateField("depth", event.target.value)} required />
          </label>
          <label>
            <span>标高</span>
            <input type="number" step="0.01" value={draft.elevation} onChange={(event) => updateField("elevation", event.target.value)} required />
          </label>
        </div>
        <label>
          <span>材质</span>
          <select value={draft.materialPreset} onChange={(event) => updateField("materialPreset", event.target.value)}>
            {MATERIAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="wall-property-actions">
          <button type="submit" className="primary-action"><Save size={15} /> {slab ? "保存修改" : "创建楼板"}</button>
          {slab ? (
            <TooltipButton label="删除楼板" className="scene-delete-wall-action" onClick={() => onDelete(slab.id)}>
              <Trash2 size={16} />
            </TooltipButton>
          ) : null}
        </div>
      </form>
    </aside>
  );
}

function createDraft(slab?: SceneSlabNode): SlabDraft {
  const bounds = getBounds(slab?.polygon ?? [[1, 1], [4, 1], [4, 4], [1, 4]]);
  return {
    name: slab?.name ?? "新楼板",
    originX: String(bounds.minX),
    originY: String(bounds.minY),
    width: String(bounds.maxX - bounds.minX),
    depth: String(bounds.maxY - bounds.minY),
    elevation: String(slab?.elevation ?? 0),
    materialPreset: slab?.materialPreset ?? "concrete"
  };
}

/** Converts the rectangular form into the shared polygon format used by the scene model. */
function toSlabPayload(draft: SlabDraft): Omit<SceneSlabNode, "id" | "type" | "parentId"> | undefined {
  const [originX, originY, width, depth, elevation] = [
    draft.originX,
    draft.originY,
    draft.width,
    draft.depth,
    draft.elevation
  ].map(Number);
  if (![originX, originY, width, depth, elevation].every(Number.isFinite) || width <= 0 || depth <= 0) return undefined;
  return {
    name: draft.name.trim(),
    polygon: [
      [originX, originY],
      [originX + width, originY],
      [originX + width, originY + depth],
      [originX, originY + depth]
    ],
    elevation,
    materialPreset: draft.materialPreset
  };
}

function getBounds(points: Array<[number, number]>): { minX: number; minY: number; maxX: number; maxY: number } {
  const [firstPoint, ...remainingPoints] = points;
  return remainingPoints.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point[0]),
      minY: Math.min(bounds.minY, point[1]),
      maxX: Math.max(bounds.maxX, point[0]),
      maxY: Math.max(bounds.maxY, point[1])
    }),
    { minX: firstPoint[0], minY: firstPoint[1], maxX: firstPoint[0], maxY: firstPoint[1] }
  );
}
