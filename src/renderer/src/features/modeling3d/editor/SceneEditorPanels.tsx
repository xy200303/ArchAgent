/** Provides navigation, real editor tools, and accessible wall property forms. */
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Box,
  BrickWall,
  Building2,
  Columns3,
  DoorOpen,
  Fence,
  ChevronDown,
  ChevronRight,
  Layers3,
  MapPinned,
  PanelsTopLeft,
  PanelTop,
  Save,
  Trash2,
  Waypoints,
  type LucideIcon
} from "lucide-react";
import { memo, useEffect, useState, type FormEvent, type JSX } from "react";
import type { SceneCommandInput, SceneNode, SceneSnapshot, SceneWallNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { TooltipButton } from "../../../shared/TooltipButton";
import { SceneToolbar } from "./SceneToolbar";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel";

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

export const SceneNavigationPanel = memo(function SceneNavigationPanel({
  snapshot,
  selectedNodeId,
  onSelectNode,
  onDeleteNode,
  onClearLevel
}: {
  snapshot: SceneSnapshot;
  selectedNodeId?: string;
  onSelectNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onClearLevel: (levelId: string) => void;
}): JSX.Element {
  return (
    <WorkspaceSidePanel label="编辑器导航" className="scene-navigation-panel">
      <SceneTreeContent
        snapshot={snapshot}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        onDeleteNode={onDeleteNode}
        onClearLevel={onClearLevel}
      />
    </WorkspaceSidePanel>
  );
});

function SceneTreeContent({
  snapshot,
  selectedNodeId,
  onSelectNode,
  onDeleteNode,
  onClearLevel
}: {
  snapshot: SceneSnapshot;
  selectedNodeId?: string;
  onSelectNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onClearLevel: (levelId: string) => void;
}): JSX.Element {
  const [sceneOpen, setSceneOpen] = useState(true);
  const [buildingOpen, setBuildingOpen] = useState(true);
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});
  const [expandedComponentGroups, setExpandedComponentGroups] = useState<Record<string, boolean>>({});
  const [pendingDeletion, setPendingDeletion] = useState<{ kind: "node" | "level"; id: string; name: string }>();
  const levels = Object.values(snapshot.nodes).filter((node) => node.type === "level");

  function toggleLevel(levelId: string): void {
    setExpandedLevels((current) => ({ ...current, [levelId]: !(current[levelId] ?? true) }));
  }

  function toggleComponentGroup(levelId: string): void {
    setExpandedComponentGroups((current) => ({ ...current, [levelId]: !(current[levelId] ?? true) }));
  }

  function confirmDeletion(): void {
    if (!pendingDeletion) return;
    if (pendingDeletion.kind === "level") onClearLevel(pendingDeletion.id);
    else onDeleteNode(pendingDeletion.id);
    setPendingDeletion(undefined);
  }

  return (
    <div className="scene-tree-panel" aria-label="场景树">
      <button
        type="button"
        className="scene-panel-heading scene-tree-toggle"
        aria-expanded={sceneOpen}
        aria-controls="scene-tree-root"
        onClick={() => setSceneOpen((open) => !open)}
      >
        {sceneOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Layers3 size={16} />
        <h2>场景</h2>
      </button>
      {sceneOpen ? (
        <div id="scene-tree-root" className="scene-tree-root">
          <button
            type="button"
            className="scene-tree-toggle"
            aria-expanded={buildingOpen}
            aria-controls="scene-tree-building"
            onClick={() => setBuildingOpen((open) => !open)}
          >
            {buildingOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Building2 size={15} />
            <span>主建筑</span>
          </button>
          {buildingOpen ? (
            <div id="scene-tree-building" className="scene-tree-branch">
              {levels.map((level) => {
                const levelOpen = expandedLevels[level.id] ?? true;
                const componentsOpen = expandedComponentGroups[level.id] ?? true;
                const components = getLevelComponents(snapshot, level.id);
                const componentGroupId = `scene-tree-components-${level.id}`;

                return (
                  <div key={level.id} className="scene-tree-branch">
                    <LevelTreeNode
                      name={level.name}
                      open={levelOpen}
                      contentId={`scene-tree-level-${level.id}`}
                      onToggle={() => toggleLevel(level.id)}
                      onClear={() => setPendingDeletion({ kind: "level", id: level.id, name: level.name })}
                    />
                    {levelOpen ? (
                      <div id={`scene-tree-level-${level.id}`} className="scene-tree-branch">
                        <button
                          type="button"
                          className="scene-tree-toggle"
                          aria-expanded={componentsOpen}
                          aria-controls={componentGroupId}
                          onClick={() => toggleComponentGroup(level.id)}
                        >
                          {componentsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <BrickWall size={15} />
                          <span>建筑构件</span>
                        </button>
                        {componentsOpen ? (
                          <div id={componentGroupId} className="scene-tree-group">
                            {components.map((component) => (
                              <SceneTreeNodeButton
                                key={component.id}
                                node={component}
                                selected={component.id === selectedNodeId}
                                onSelectNode={onSelectNode}
                                onDelete={() => setPendingDeletion({ kind: "node", id: component.id, name: component.name })}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      <SceneTreeDeleteDialog
        pending={pendingDeletion}
        onOpenChange={(open) => { if (!open) setPendingDeletion(undefined); }}
        onConfirm={confirmDeletion}
      />
    </div>
  );
}

function LevelTreeNode({
  name,
  open,
  contentId,
  onToggle,
  onClear
}: {
  name: string;
  open: boolean;
  contentId: string;
  onToggle: () => void;
  onClear: () => void;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="scene-tree-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onPointerDown={(event) => {
            if (event.button === 0) event.preventDefault();
          }}
          onClick={onToggle}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuOpen(true);
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Layers3 size={15} />
          <span>{name}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-content scene-tree-context-menu" align="start" sideOffset={4}>
          <DropdownMenu.Item className="dropdown-item danger" onSelect={onClear}>
            <Trash2 size={14} />
            清空本层内容
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const COMPONENT_ICON_BY_TYPE: Record<Exclude<SceneNode["type"], "site" | "building" | "level">, LucideIcon> = {
  wall: BrickWall,
  slab: PanelsTopLeft,
  ceiling: PanelTop,
  column: Columns3,
  zone: MapPinned,
  stair: Waypoints,
  fence: Fence,
  door: DoorOpen,
  window: PanelsTopLeft,
  asset: Box
};

function isSceneComponent(node: SceneNode): node is Exclude<SceneNode, { type: "site" | "building" | "level" }> {
  return node.type !== "site" && node.type !== "building" && node.type !== "level";
}

/** Returns every component below a level, including doors and windows nested under walls. */
function getLevelComponents(
  snapshot: SceneSnapshot,
  levelId: string
): Array<Exclude<SceneNode, { type: "site" | "building" | "level" }>> {
  const descendantIds = new Set<string>();
  const parentIds = [levelId];

  while (parentIds.length) {
    const parentId = parentIds.pop();
    if (!parentId) continue;
    for (const node of Object.values(snapshot.nodes)) {
      if (node.parentId !== parentId || descendantIds.has(node.id)) continue;
      descendantIds.add(node.id);
      parentIds.push(node.id);
    }
  }

  return Object.values(snapshot.nodes).filter(
    (node): node is Exclude<SceneNode, { type: "site" | "building" | "level" }> => descendantIds.has(node.id) && isSceneComponent(node)
  );
}

function SceneTreeNodeButton({
  node,
  selected,
  onSelectNode,
  onDelete
}: {
  node: Exclude<SceneNode, { type: "site" | "building" | "level" }>;
  selected: boolean;
  onSelectNode: (id: string) => void;
  onDelete: () => void;
}): JSX.Element {
  const Icon = COMPONENT_ICON_BY_TYPE[node.type];
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={selected ? "scene-tree-node selected" : "scene-tree-node"}
          aria-pressed={selected}
          onPointerDown={(event) => {
            if (event.button === 0) event.preventDefault();
          }}
          onClick={() => onSelectNode(node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            onSelectNode(node.id);
            setMenuOpen(true);
          }}
        >
          <Icon size={14} />
          <span>{node.name}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-content scene-tree-context-menu" align="start" sideOffset={4}>
          <DropdownMenu.Item className="dropdown-item danger" onSelect={onDelete}>
            <Trash2 size={14} />
            删除构件
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SceneTreeDeleteDialog({
  pending,
  onOpenChange,
  onConfirm
}: {
  pending?: { kind: "node" | "level"; id: string; name: string };
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}): JSX.Element {
  const isLevel = pending?.kind === "level";
  return (
    <AlertDialog.Root open={Boolean(pending)} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-backdrop" />
        <AlertDialog.Content className="modal-panel delete-panel">
          <AlertDialog.Title>{isLevel ? "清空本层内容？" : "删除构件？"}</AlertDialog.Title>
          <AlertDialog.Description>
            {isLevel
              ? `将删除“${pending?.name}”中的所有构件和后代节点，楼层本身会保留。`
              : `将从场景中删除“${pending?.name}”及其后代节点。`}
          </AlertDialog.Description>
          <footer>
            <AlertDialog.Cancel asChild>
              <button type="button" className="secondary-action">取消</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button type="button" className="danger-action" onClick={onConfirm}>
                {isLevel ? "清空本层" : "删除构件"}
              </button>
            </AlertDialog.Action>
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export const WallInspector = memo(function WallInspector({
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
      <SceneToolbar
        title={wall ? "墙体属性" : "新建墙体"}
        icon={BrickWall}
        className="scene-inspector-heading"
      >
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
});

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
