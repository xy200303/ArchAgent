/** Coordinates scene commands, snapshots, and the renderer-side Pascal viewport. */
import { Blocks, Layers3, Orbit, Plus, Square } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type { ArchAgentApi } from "../../../../../shared/types";
import type { SceneCommandInput, SceneSlabNode, SceneSnapshot, SceneWallNode } from "../../../../../shared/modeling3d/sceneContracts";
import { getErrorMessage } from "../../../platform/bridge";
import { TooltipButton } from "../../../shared/TooltipButton";
import { ComponentLibraryPanel } from "../editor/ComponentLibraryPanel";
import { SceneNavigationPanel, WallInspector } from "../editor/SceneEditorPanels";
import { SlabInspector } from "../editor/SlabInspector";
import type { BuiltInComponentId, ComponentLibraryRequest } from "../editor/componentLibraryContracts";
import { SceneToolbar } from "../editor/SceneToolbar";
import { PascalPreviewBoundary } from "./PascalPreviewBoundary";
import type { PascalCameraPreset } from "./PascalViewer";

const PascalViewer = lazy(() => import("./PascalViewer"));

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
  const [panelMode, setPanelMode] = useState<"none" | "create-wall" | "create-slab" | "selected">("none");
  const [pascalCameraPreset, setPascalCameraPreset] = useState<PascalCameraPreset>("free");
  const [pascalPreviewKey, setPascalPreviewKey] = useState(0);
  const [message, setMessage] = useState("");

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
      if (event.type === "scene.command.applied" && active) setSnapshot(event.payload.snapshot);
    });
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

  const openWallCreation = useCallback((): void => {
    setSelectedNodeId(undefined);
    setPanelMode("create-wall");
  }, []);

  const openSlabCreation = useCallback((): void => {
    setSelectedNodeId(undefined);
    setPanelMode("create-slab");
  }, []);

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
  }, [componentRequest?.componentId, componentRequest?.revision, openSlabCreation, openWallCreation]);

  const handlePascalError = useCallback((error: string): void => {
    setMessage(`三维场景同步失败：${error}`);
  }, []);

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
        result.command.type === "slab.update"
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

  const deleteNode = useCallback((id: string): void => {
    void execute({ type: "node.delete", id });
  }, [execute]);

  if (!snapshot) {
    return <div className="spatial-editor spatial-editor-fallback"><strong>正在加载空间场景…</strong></div>;
  }

  const showInspector = panelMode !== "none";
  const componentLibraryOpen = sidebarMode === "components";
  const sceneNavigationOpen = sidebarMode === "explorer";

  return (
    <section className="spatial-editor">
      <SceneToolbar title={componentLibraryOpen ? "构件库" : "空间编辑器"} icon={componentLibraryOpen ? Blocks : Layers3}>
        {componentLibraryOpen ? null : (
          <div className="scene-toolbar-viewport" role="toolbar" aria-label="视图控制">
            <TooltipButton label="自由视角" className="scene-tool-button" onClick={() => setPascalCameraPreset("free")}>
              <Orbit size={17} />
            </TooltipButton>
            <TooltipButton label="顶视图" className="scene-tool-button" onClick={() => setPascalCameraPreset("top")}>
              <Square size={17} />
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
        <div className="scene-viewport">
          <PascalPreviewBoundary key={pascalPreviewKey} onRetry={() => setPascalPreviewKey((key) => key + 1)}>
            <Suspense fallback={<div className="spatial-editor-fallback">正在加载三维视图…</div>}>
              <PascalViewer
                snapshot={snapshot}
                cameraPreset={pascalCameraPreset}
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
      </div>
    </section>
  );
}
