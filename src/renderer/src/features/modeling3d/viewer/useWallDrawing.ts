/** Owns transient wall-drawing state without writing the shared scene snapshot. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneCommandInput, ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";
import { isWallDrawingSegment } from "./wallDrawingMath";

export interface WallDrawingDraft {
  start: ScenePoint;
  end?: ScenePoint;
}

export function useWallDrawing({
  parentId,
  onCreateWall
}: {
  parentId: string;
  onCreateWall: (command: Extract<SceneCommandInput, { type: "wall.create" }>) => Promise<void>;
}) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState<WallDrawingDraft | undefined>(undefined);
  const draftRef = useRef<WallDrawingDraft | undefined>(undefined);

  const replaceDraft = useCallback((nextDraft?: WallDrawingDraft): void => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const cancel = useCallback((): void => {
    setActive(false);
    replaceDraft();
  }, [replaceDraft]);

  const toggle = useCallback((): void => {
    setActive((current) => !current);
    replaceDraft();
  }, [replaceDraft]);

  const previewPoint = useCallback((point: ScenePoint): void => {
    const current = draftRef.current;
    if (current) replaceDraft({ ...current, end: point });
  }, [replaceDraft]);

  const placePoint = useCallback((point: ScenePoint): void => {
    const current = draftRef.current;
    if (!current) {
      replaceDraft({ start: point });
      return;
    }
    if (!isWallDrawingSegment(current.start, point)) return;

    replaceDraft();
    void onCreateWall({ type: "wall.create", parentId, start: current.start, end: point });
  }, [onCreateWall, parentId, replaceDraft]);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, cancel]);

  return { active, draft, cancel, toggle, previewPoint, placePoint };
}
