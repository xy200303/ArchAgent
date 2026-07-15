/** Coordinates scene commands, snapshots, and the renderer-side Pascal viewport. */
import { useEffect, useMemo, useState, type JSX } from "react";
import type { ArchAgentApi } from "../../../../../shared/types";
import type { SceneCommandInput, SceneSnapshot, SceneWallNode } from "../../../../../shared/modeling3d/sceneContracts";
import { getErrorMessage } from "../../../platform/bridge";
import { SceneNavigationPanel, SceneToolbar, WallInspector } from "../editor/SceneEditorPanels";
import type { CameraCommand } from "../viewport/CameraPresetController";
import type { CameraPreset } from "../viewport/cameraPresets";
import { SceneViewport } from "../viewport/SceneViewport";
import { useWallDrawing } from "../viewport/useWallDrawing";
import type { ComponentLibraryRequest } from "../editor/componentLibraryContracts";

export function SpatialEditor({
  api,
  componentRequest,
  componentLibraryOpen
}: {
  api: ArchAgentApi;
  componentRequest?: ComponentLibraryRequest;
  componentLibraryOpen: boolean;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<SceneSnapshot>();
  const [selectedWallId, setSelectedWallId] = useState<string>();
  const [panelMode, setPanelMode] = useState<"none" | "create-wall" | "selected">("none");
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>();
  const [message, setMessage] = useState("");
  const wallDrawing = useWallDrawing(async (command) => execute(command));

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

  const selectedWall = useMemo(() => {
    const node = selectedWallId ? snapshot?.nodes[selectedWallId] : undefined;
    return node?.type === "wall" ? node : undefined;
  }, [selectedWallId, snapshot]);

  useEffect(() => {
    if (componentRequest?.componentId === "wall") openWallCreation();
  }, [componentRequest?.revision]);

  async function execute(command: SceneCommandInput): Promise<void> {
    try {
      const result = await api.scene.execute(command);
      if (!result.accepted) {
        setMessage(result.message);
        return;
      }
      setSnapshot(result.snapshot);
      if (result.command.type === "wall.create" || result.command.type === "wall.update") {
        setSelectedWallId(result.command.id);
        if (!wallDrawing.active) setPanelMode("selected");
      }
      if (result.command.type === "node.delete") {
        setSelectedWallId(undefined);
        setPanelMode("none");
      }
      setMessage("");
    } catch (error) {
      setMessage(`场景操作失败：${getErrorMessage(error)}`);
    }
  }

  if (!snapshot) {
    return <div className="spatial-editor spatial-editor-fallback"><strong>正在加载空间场景…</strong></div>;
  }

  const showInspector = panelMode !== "none";

  function selectWall(id?: string): void {
    setSelectedWallId(id);
    setPanelMode(id ? "selected" : "none");
  }

  function openWallCreation(): void {
    wallDrawing.cancel();
    setSelectedWallId(undefined);
    setPanelMode("create-wall");
  }

  function activateSelectTool(): void {
    wallDrawing.cancel();
  }

  function toggleWallDrawing(): void {
    if (!wallDrawing.active) {
      setSelectedWallId(undefined);
      setPanelMode("none");
    }
    wallDrawing.toggle();
  }

  function setCameraPreset(preset: CameraPreset): void {
    setCameraCommand((current) => ({ preset, revision: (current?.revision ?? 0) + 1 }));
  }

  return (
    <section className="spatial-editor">
      <SceneToolbar
        wallDrawingActive={wallDrawing.active}
        onToggleWallDrawing={toggleWallDrawing}
        onSelectTool={activateSelectTool}
        onCreateWall={openWallCreation}
        onCameraPreset={setCameraPreset}
        componentLibraryOpen={componentLibraryOpen}
      />
      {message ? <div className="scene-editor-message" role="status">{message}</div> : null}
      <div className={`scene-editor-layout${showInspector ? " has-inspector" : ""}${componentLibraryOpen ? " no-navigation" : ""}`}>
        {componentLibraryOpen ? null : <SceneNavigationPanel snapshot={snapshot} selectedWallId={selectedWallId} onSelectWall={selectWall} />}
        <div className="scene-viewport">
          <SceneViewport
            snapshot={snapshot}
            selectedWallId={selectedWallId}
            onSelectWall={selectWall}
            wallDrawingActive={wallDrawing.active}
            wallDrawingDraft={wallDrawing.draft}
            onWallDrawingPoint={wallDrawing.placePoint}
            onWallDrawingPreview={wallDrawing.previewPoint}
            cameraCommand={cameraCommand}
          />
        </div>
        {showInspector ? (
          <WallInspector
            wall={selectedWall}
            onCreate={(command) => void execute(command)}
            onUpdate={(command) => void execute(command)}
            onDelete={(id) => void execute({ type: "node.delete", id })}
            onClose={() => selectWall(undefined)}
          />
        ) : null}
      </div>
    </section>
  );
}
