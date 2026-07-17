/** Coordinates scene commands, snapshots, and the renderer-side Pascal viewport. */
import { Axis3d, Blocks, Check, ChevronDown, Crosshair, Layers3, Orbit, PanelsTopLeft, PencilRuler, Plus, Redo2, Square, Undo2, type LucideIcon } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type { ArchAgentApi } from "../../../../../shared/types";
import type { SceneCeilingNode, SceneColumnNode, SceneCommandInput, SceneDoorNode, SceneSlabNode, SceneSnapshot, SceneWallNode, SceneWindowNode } from "../../../../../shared/modeling3d/sceneContracts";
import type { SceneHistoryState } from "../../../../../shared/modeling3d/sceneContracts";
import { getErrorMessage } from "../../../platform/bridge";
import { TooltipButton } from "../../../shared/TooltipButton";
import { ComponentLibraryPanel } from "../editor/ComponentLibraryPanel";
import { SceneNavigationPanel, WallInspector } from "../editor/SceneEditorPanels";
import { SlabInspector } from "../editor/SlabInspector";
import { DoorInspector } from "../editor/DoorInspector";
import { WindowInspector } from "../editor/WindowInspector";
import { CeilingInspector } from "../editor/CeilingInspector";
import { ColumnInspector } from "../editor/ColumnInspector";
import { ZoneInspector } from "../editor/ZoneInspector";
import { StairInspector } from "../editor/StairInspector";
import { FenceInspector } from "../editor/FenceInspector";
import type { BuiltInComponentId, ComponentLibraryRequest } from "../editor/componentLibraryContracts";
import { SceneToolbar } from "../editor/SceneToolbar";
import { PascalPreviewBoundary } from "./PascalPreviewBoundary";
import type { PascalCameraPreset } from "./PascalViewer";
import { useWallDrawing } from "./useWallDrawing";

const PascalViewer = lazy(() => import("./PascalViewer"));

const CAMERA_PRESET_OPTIONS: Array<{ id: PascalCameraPreset; label: string; icon: LucideIcon }> = [
  { id: "free", label: "自由视角", icon: Orbit },
  { id: "top", label: "顶视图", icon: Square },
  { id: "front", label: "正视图", icon: PanelsTopLeft },
  { id: "right", label: "右视图", icon: Axis3d }
];

export function SpatialEditor({
  api,
  componentRequest,
  sidebarMode,
  onSelectBuiltInComponent
}: {
  api: ArchAgentApi;
  componentRequest?: ComponentLibraryRequest;
  sidebarMode?: "explorer" | "components";
  onSelectBuiltInComponent: (componentId: BuiltInComponentId) => void;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<SceneSnapshot>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [panelMode, setPanelMode] = useState<"none" | "create-wall" | "create-slab" | "create-ceiling" | "create-column" | "create-zone" | "create-stair" | "create-fence" | "create-door" | "create-window" | "selected">("none");
  const [pascalCameraPreset, setPascalCameraPreset] = useState<PascalCameraPreset>("free");
  const [pascalCameraRevision, setPascalCameraRevision] = useState(0);
  const [focusRevision, setFocusRevision] = useState(0);
  const [pascalPreviewKey, setPascalPreviewKey] = useState(0);
  const [message, setMessage] = useState("");
  const [historyState, setHistoryState] = useState<SceneHistoryState>({ canUndo: false, canRedo: false });

  useEffect(() => {
    let active = true;
    void api.scene
      .getSnapshot()
      .then((nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      })
      .catch((error: unknown) => {
        if (active) setMessage(`场景加载失败：${getErrorMessage(error)}`);
      });
    const unsubscribe = api.events.subscribe((event) => {
      if (!active) return;
      if (event.type === "scene.command.applied") setSnapshot(event.payload.snapshot);
      if (event.type === "scene.snapshot.restored") setSnapshot(event.payload);
      if (event.type === "scene.command.applied" || event.type === "scene.snapshot.restored") {
        void api.scene.getHistoryState().then(setHistoryState);
      }
    });
    void api.scene.getHistoryState().then((nextState) => { if (active) setHistoryState(nextState); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  const selectedNode = useMemo(() => selectedNodeId ? snapshot?.nodes[selectedNodeId] : undefined, [selectedNodeId, snapshot]);
  const selectedWall = useMemo(() => {
    const node = selectedNode;
    return node?.type === "wall" ? node : undefined;
  }, [selectedNode]);
  const selectedSlab = useMemo(() => {
    const node = selectedNode;
    return node?.type === "slab" ? node : undefined;
  }, [selectedNode]);
  const selectedCeiling = useMemo(() => selectedNode?.type === "ceiling" ? selectedNode : undefined, [selectedNode]);
  const selectedColumn = useMemo(() => selectedNode?.type === "column" ? selectedNode : undefined, [selectedNode]);
  const selectedZone = useMemo(() => selectedNode?.type === "zone" ? selectedNode : undefined, [selectedNode]);
  const selectedStair = useMemo(() => selectedNode?.type === "stair" ? selectedNode : undefined, [selectedNode]);
  const selectedFence = useMemo(() => selectedNode?.type === "fence" ? selectedNode : undefined, [selectedNode]);
  const selectedDoor = useMemo(() => selectedNode?.type === "door" ? selectedNode : undefined, [selectedNode]);
  const selectedWindow = useMemo(() => selectedNode?.type === "window" ? selectedNode : undefined, [selectedNode]);
  const walls = useMemo(() => Object.values(snapshot?.nodes ?? {}).filter((node): node is SceneWallNode => node.type === "wall"), [snapshot]);
  const componentLibraryOpen = sidebarMode === "components";
  const sceneNavigationOpen = sidebarMode === "explorer";
  const activeLevelId = useMemo(
    () => Object.values(snapshot?.nodes ?? {}).find((node) => node.type === "level")?.id ?? "level_default",
    [snapshot]
  );
  const focusTarget = useMemo(() => getFocusTarget(selectedNode, snapshot), [selectedNode, snapshot]);

  const openWallCreation = useCallback((): void => {
    setSelectedNodeId(undefined);
    setPanelMode("create-wall");
  }, []);

  const openSlabCreation = useCallback((): void => {
    setSelectedNodeId(undefined);
    setPanelMode("create-slab");
  }, []);
  const openCeilingCreation = useCallback((): void => { setSelectedNodeId(undefined); setPanelMode("create-ceiling"); }, []);
  const openColumnCreation = useCallback((): void => { setSelectedNodeId(undefined); setPanelMode("create-column"); }, []);
  const openZoneCreation = useCallback((): void => { setSelectedNodeId(undefined); setPanelMode("create-zone"); }, []);
  const openStairCreation = useCallback((): void => { setSelectedNodeId(undefined); setPanelMode("create-stair"); }, []);
  const openFenceCreation = useCallback((): void => { setSelectedNodeId(undefined); setPanelMode("create-fence"); }, []);
  const openDoorCreation = useCallback((): void => { setSelectedNodeId(undefined); setPanelMode("create-door"); }, []);
  const openWindowCreation = useCallback((): void => { setSelectedNodeId(undefined); setPanelMode("create-window"); }, []);

  const selectNode = useCallback((id?: string): void => {
    setSelectedNodeId(id);
    setPanelMode(id ? "selected" : "none");
  }, []);

  const closeInspector = useCallback((): void => {
    selectNode(undefined);
  }, [selectNode]);

  useEffect(() => {
    if (componentRequest?.componentId === "wall") openWallCreation();
    if (componentRequest?.componentId === "slab") openSlabCreation();
    if (componentRequest?.componentId === "ceiling") openCeilingCreation();
    if (componentRequest?.componentId === "column") openColumnCreation();
    if (componentRequest?.componentId === "zone") openZoneCreation();
    if (componentRequest?.componentId === "stair") openStairCreation();
    if (componentRequest?.componentId === "fence") openFenceCreation();
    if (componentRequest?.componentId === "door") openDoorCreation();
    if (componentRequest?.componentId === "window") openWindowCreation();
  }, [componentRequest?.componentId, componentRequest?.revision, openCeilingCreation, openColumnCreation, openDoorCreation, openFenceCreation, openSlabCreation, openStairCreation, openWallCreation, openWindowCreation, openZoneCreation]);

  const handlePascalError = useCallback((error: string): void => {
    setMessage(`三维场景同步失败：${error}`);
  }, []);

  /** Requests a camera move even when the selected preset has not changed. */
  const selectCameraPreset = useCallback((preset: PascalCameraPreset): void => {
    setPascalCameraPreset(preset);
    setPascalCameraRevision((revision) => revision + 1);
  }, []);

  const focusSelectedNode = useCallback((): void => {
    if (focusTarget) setFocusRevision((revision) => revision + 1);
  }, [focusTarget]);

  const restoreHistory = useCallback(async (direction: "undo" | "redo"): Promise<void> => {
    try {
      const result = await api.scene[direction]();
      setSnapshot(result.snapshot);
      setHistoryState(result);
      if (!result.accepted) return;
      setSelectedNodeId(undefined);
      setPanelMode("none");
      setMessage("");
    } catch (error) {
      setMessage(`场景${direction === "undo" ? "撤销" : "重做"}失败：${getErrorMessage(error)}`);
    }
  }, [api]);

  const execute = useCallback(async (command: SceneCommandInput): Promise<void> => {
    try {
      const result = await api.scene.execute(command);
      if (!result.accepted) {
        setMessage(result.message);
        return;
      }
      setSnapshot(result.snapshot);
      if (
        result.command.type === "wall.create" ||
        result.command.type === "wall.update" ||
        result.command.type === "slab.create" ||
        result.command.type === "slab.update" ||
        result.command.type === "ceiling.create" ||
        result.command.type === "ceiling.update" ||
        result.command.type === "column.create" || result.command.type === "column.update" ||
        result.command.type === "zone.create" || result.command.type === "zone.update" ||
        result.command.type === "stair.create" || result.command.type === "stair.update" ||
        result.command.type === "fence.create" || result.command.type === "fence.update" ||
        result.command.type === "door.create" ||
        result.command.type === "door.update" ||
        result.command.type === "window.create" ||
        result.command.type === "window.update"
      ) {
        setSelectedNodeId(result.command.id);
        setPanelMode("selected");
      }
      if (result.command.type === "node.delete") {
        setSelectedNodeId(undefined);
        setPanelMode("none");
      }
      setMessage("");
    } catch (error) {
      setMessage(`场景操作失败：${getErrorMessage(error)}`);
    }
  }, [api]);

  const createWall = useCallback((command: Extract<SceneCommandInput, { type: "wall.create" }>): void => {
    void execute(command);
  }, [execute]);

  const updateWall = useCallback((command: Extract<SceneCommandInput, { type: "wall.update" }>): void => {
    void execute(command);
  }, [execute]);

  const createSlab = useCallback((command: Extract<SceneCommandInput, { type: "slab.create" }>): void => {
    void execute(command);
  }, [execute]);

  const updateSlab = useCallback((command: Extract<SceneCommandInput, { type: "slab.update" }>): void => {
    void execute(command);
  }, [execute]);
  const createCeiling = useCallback((command: Extract<SceneCommandInput, { type: "ceiling.create" }>): void => { void execute(command); }, [execute]);
  const updateCeiling = useCallback((command: Extract<SceneCommandInput, { type: "ceiling.update" }>): void => { void execute(command); }, [execute]);
  const createColumn = useCallback((command: Extract<SceneCommandInput, { type: "column.create" }>): void => { void execute(command); }, [execute]);
  const updateColumn = useCallback((command: Extract<SceneCommandInput, { type: "column.update" }>): void => { void execute(command); }, [execute]);
  const createZone = useCallback((command: Extract<SceneCommandInput, { type: "zone.create" }>): void => { void execute(command); }, [execute]);
  const updateZone = useCallback((command: Extract<SceneCommandInput, { type: "zone.update" }>): void => { void execute(command); }, [execute]);
  const createStair = useCallback((command: Extract<SceneCommandInput, { type: "stair.create" }>): void => { void execute(command); }, [execute]);
  const updateStair = useCallback((command: Extract<SceneCommandInput, { type: "stair.update" }>): void => { void execute(command); }, [execute]);
  const createFence = useCallback((command: Extract<SceneCommandInput, { type: "fence.create" }>): void => { void execute(command); }, [execute]);
  const updateFence = useCallback((command: Extract<SceneCommandInput, { type: "fence.update" }>): void => { void execute(command); }, [execute]);
  const createDoor = useCallback((command: Extract<SceneCommandInput, { type: "door.create" }>): void => { void execute(command); }, [execute]);
  const updateDoor = useCallback((command: Extract<SceneCommandInput, { type: "door.update" }>): void => { void execute(command); }, [execute]);
  const createWindow = useCallback((command: Extract<SceneCommandInput, { type: "window.create" }>): void => { void execute(command); }, [execute]);
  const updateWindow = useCallback((command: Extract<SceneCommandInput, { type: "window.update" }>): void => { void execute(command); }, [execute]);

  const createDrawnWall = useCallback(async (command: Extract<SceneCommandInput, { type: "wall.create" }>): Promise<void> => {
    await execute(command);
  }, [execute]);
  const wallDrawing = useWallDrawing({ parentId: activeLevelId, onCreateWall: createDrawnWall });

  useEffect(() => {
    if (componentLibraryOpen && wallDrawing.active) wallDrawing.cancel();
  }, [componentLibraryOpen, wallDrawing.active, wallDrawing.cancel]);

  const toggleWallDrawing = useCallback((): void => {
    if (!wallDrawing.active) selectNode(undefined);
    wallDrawing.toggle();
  }, [selectNode, wallDrawing]);

  const deleteNode = useCallback((id: string): void => {
    void execute({ type: "node.delete", id });
  }, [execute]);

  if (!snapshot) {
    return <div className="spatial-editor spatial-editor-fallback"><strong>正在加载空间场景…</strong></div>;
  }

  const showInspector = panelMode !== "none";
  return (
    <section className="spatial-editor">
      <SceneToolbar title={componentLibraryOpen ? "构件库" : "空间编辑器"} icon={componentLibraryOpen ? Blocks : Layers3}>
        {componentLibraryOpen ? null : (
          <div className="scene-toolbar-viewport" role="toolbar" aria-label="视图控制">
            <TooltipButton label={wallDrawing.active ? "退出画墙工具" : "绘制墙体"} className={`scene-tool-button${wallDrawing.active ? " active" : ""}`} pressed={wallDrawing.active} onClick={toggleWallDrawing}>
              <PencilRuler size={17} />
            </TooltipButton>
            <TooltipButton label="聚焦选中构件" className="scene-tool-button" disabled={!focusTarget} onClick={focusSelectedNode}>
              <Crosshair size={17} />
            </TooltipButton>
            <CameraPresetMenu preset={pascalCameraPreset} onSelectPreset={selectCameraPreset} />
            <span className="scene-toolbar-divider" aria-hidden="true" />
            <TooltipButton label="撤销上一步" className="scene-tool-button" onClick={() => void restoreHistory("undo")} disabled={!historyState.canUndo}>
              <Undo2 size={17} />
            </TooltipButton>
            <TooltipButton label="重做上一步" className="scene-tool-button" onClick={() => void restoreHistory("redo")} disabled={!historyState.canRedo}>
              <Redo2 size={17} />
            </TooltipButton>
            <button type="button" className="primary-action scene-create-wall-action" onClick={openWallCreation}>
              <Plus size={16} />
              参数创建
            </button>
          </div>
        )}
      </SceneToolbar>
      {message ? <div className="scene-editor-message" role="status">{message}</div> : null}
      <div
        className={`scene-editor-layout${showInspector ? " has-inspector" : ""}${componentLibraryOpen ? " component-library-mode" : ""}${sceneNavigationOpen ? "" : " no-navigation"}`}
      >
        {componentLibraryOpen ? <ComponentLibraryPanel onSelectComponent={onSelectBuiltInComponent} /> : null}
        {sceneNavigationOpen ? <SceneNavigationPanel snapshot={snapshot} selectedNodeId={selectedNodeId} onSelectNode={selectNode} /> : null}
        <div className={`scene-viewport${wallDrawing.active ? " drawing" : ""}`}>
          {wallDrawing.active ? (
            <div className="spatial-editor-notice" role="status">
              <span>{wallDrawing.draft ? "移动鼠标预览，点击第二个点完成墙体" : "点击起点开始绘制墙体"}</span>
              <div className="spatial-editor-notice-actions">
                <button type="button" onClick={wallDrawing.cancel}>取消（Esc）</button>
              </div>
            </div>
          ) : null}
          <PascalPreviewBoundary key={pascalPreviewKey} onRetry={() => setPascalPreviewKey((key) => key + 1)}>
            <Suspense fallback={<div className="spatial-editor-fallback">正在加载三维视图…</div>}>
              <PascalViewer
                snapshot={snapshot}
                cameraPreset={pascalCameraPreset}
                cameraRevision={pascalCameraRevision}
                wallDrawingActive={wallDrawing.active}
                wallDrawingDraft={wallDrawing.draft}
                onWallDrawingPoint={wallDrawing.placePoint}
                onWallDrawingPreview={wallDrawing.previewPoint}
                selectedNodeId={selectedNodeId}
                onSelectNode={selectNode}
                focusTarget={focusTarget}
                focusRevision={focusRevision}
                onError={handlePascalError}
              />
            </Suspense>
          </PascalPreviewBoundary>
        </div>
        {panelMode === "create-wall" || selectedWall ? (
          <WallInspector
            wall={selectedWall}
            onCreate={createWall}
            onUpdate={updateWall}
            onDelete={deleteNode}
            onClose={closeInspector}
          />
        ) : null}
        {panelMode === "create-slab" || selectedSlab ? (
          <SlabInspector
            slab={selectedSlab}
            onCreate={createSlab}
            onUpdate={updateSlab}
            onDelete={deleteNode}
            onClose={closeInspector}
          />
        ) : null}
        {panelMode === "create-ceiling" || selectedCeiling ? (
          <CeilingInspector ceiling={selectedCeiling} onCreate={createCeiling} onUpdate={updateCeiling} onDelete={deleteNode} onClose={closeInspector} />
        ) : null}
        {panelMode === "create-column" || selectedColumn ? <ColumnInspector column={selectedColumn} onCreate={createColumn} onUpdate={updateColumn} onDelete={deleteNode} onClose={closeInspector} /> : null}
        {panelMode === "create-zone" || selectedZone ? <ZoneInspector zone={selectedZone} onCreate={createZone} onUpdate={updateZone} onDelete={deleteNode} onClose={closeInspector} /> : null}
        {panelMode === "create-stair" || selectedStair ? <StairInspector stair={selectedStair} onCreate={createStair} onUpdate={updateStair} onDelete={deleteNode} onClose={closeInspector} /> : null}
        {panelMode === "create-fence" || selectedFence ? <FenceInspector fence={selectedFence} onCreate={createFence} onUpdate={updateFence} onDelete={deleteNode} onClose={closeInspector} /> : null}
        {panelMode === "create-door" || selectedDoor ? (
          <DoorInspector door={selectedDoor} walls={walls} onCreate={createDoor} onUpdate={updateDoor} onDelete={deleteNode} onClose={closeInspector} />
        ) : null}
        {panelMode === "create-window" || selectedWindow ? (
          <WindowInspector window={selectedWindow} walls={walls} onCreate={createWindow} onUpdate={updateWindow} onDelete={deleteNode} onClose={closeInspector} />
        ) : null}
      </div>
    </section>
  );
}

function CameraPresetMenu({
  preset,
  onSelectPreset
}: {
  preset: PascalCameraPreset;
  onSelectPreset: (preset: PascalCameraPreset) => void;
}): JSX.Element {
  const current = CAMERA_PRESET_OPTIONS.find((option) => option.id === preset) ?? CAMERA_PRESET_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="scene-camera-trigger" aria-label={`选择视图，当前为${current.label}`}>
          <CurrentIcon size={16} aria-hidden="true" />
          <span className="scene-camera-trigger-label">视图</span>
          <span className="scene-camera-trigger-value">{current.label}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-content scene-camera-menu" align="end" sideOffset={8}>
          {CAMERA_PRESET_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenu.Item
                key={option.id}
                className="dropdown-item scene-camera-menu-item"
                onSelect={() => onSelectPreset(option.id)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{option.label}</span>
                {option.id === preset ? <Check size={15} className="scene-camera-selected-icon" aria-label="当前视图" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function getFocusTarget(selectedNode: SceneSnapshot["nodes"][string] | undefined, snapshot: SceneSnapshot | undefined): [number, number, number] | undefined {
  if (!selectedNode) return undefined;
  if (selectedNode.type === "wall") return [(selectedNode.start[0] + selectedNode.end[0]) / 2, selectedNode.height / 2, (selectedNode.start[1] + selectedNode.end[1]) / 2];
  if (selectedNode.type === "fence") return [(selectedNode.start[0] + selectedNode.end[0]) / 2, selectedNode.height / 2, (selectedNode.start[1] + selectedNode.end[1]) / 2];
  if (selectedNode.type === "slab" || selectedNode.type === "ceiling") {
    const xValues = selectedNode.polygon.map((point) => point[0]);
    const zValues = selectedNode.polygon.map((point) => point[1]);
    return [(Math.min(...xValues) + Math.max(...xValues)) / 2, selectedNode.type === "slab" ? selectedNode.elevation : selectedNode.height, (Math.min(...zValues) + Math.max(...zValues)) / 2];
  }
  if (selectedNode.type === "column") {
    return [selectedNode.position[0], selectedNode.position[1] + selectedNode.height / 2, selectedNode.position[2]];
  }
  if (selectedNode.type === "zone") {
    const xValues = selectedNode.polygon.map((point) => point[0]);
    const zValues = selectedNode.polygon.map((point) => point[1]);
    return [(Math.min(...xValues) + Math.max(...xValues)) / 2, 0, (Math.min(...zValues) + Math.max(...zValues)) / 2];
  }
  if (selectedNode.type === "stair") {
    return [selectedNode.position[0], selectedNode.position[1] + selectedNode.totalRise / 2, selectedNode.position[2]];
  }
  if (selectedNode.type === "door" || selectedNode.type === "window") {
    const wall = snapshot?.nodes[selectedNode.wallId];
    if (!wall || wall.type !== "wall") return undefined;
    const ratio = (selectedNode.offset + selectedNode.width / 2) / Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    return [wall.start[0] + (wall.end[0] - wall.start[0]) * ratio, selectedNode.sillHeight + selectedNode.height / 2, wall.start[1] + (wall.end[1] - wall.start[1]) * ratio];
  }
  return undefined;
}
