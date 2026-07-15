/** Owns transient wall-tool state without mutating the shared scene snapshot. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneCommandInput, ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";
import { isWallDrawingSegment } from "./wallDrawingMath";

export interface WallDrawingDraft {
  start: ScenePoint;
  end?: ScenePoint;
}

export function useWallDrawing(onCreateWall: (command: Extract<SceneCommandInput, { type: "wall.create" }>) => Promise<void>) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState<WallDrawingDraft>();
  const draftRef = useRef<WallDrawingDraft | undefined>(undefined);

  const replaceDraft = useCallback((nextDraft: WallDrawingDraft | undefined): void => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const cancel = useCallback(() => {
    setActive(false);
    replaceDraft(undefined);
  }, [replaceDraft]);

  const toggle = useCallback(() => {
    setActive((current) => !current);
    replaceDraft(undefined);
  }, [replaceDraft]);

  const previewPoint = useCallback((point: ScenePoint) => {
    const current = draftRef.current;
    if (current) replaceDraft({ ...current, end: point });
  }, [replaceDraft]);

  const placePoint = useCallback((point: ScenePoint) => {
    const current = draftRef.current;
    if (!current) {
      replaceDraft({ start: point });
      return;
    }
    if (!isWallDrawingSegment(current.start, point)) return;

    // Commands are side effects and must stay outside React state updaters.
    replaceDraft(undefined);
    void onCreateWall({ type: "wall.create", parentId: "level_default", start: current.start, end: point });
  }, [onCreateWall, replaceDraft]);

  useEffect(() => {
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") cancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, cancel]);

  return { active, draft, cancel, toggle, previewPoint, placePoint };
}
