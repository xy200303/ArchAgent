/** Turns a long-press drag on an already selected component into a single ground-placement operation. */
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, type JSX } from "react";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import type { ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";
import { snapWallDrawingPoint } from "./wallDrawingMath";

const LONG_PRESS_DELAY_MS = 180;
const CANCEL_DISTANCE_PX = 8;
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

type DragInteraction = {
  nodeId: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  timer?: number;
};

export function SelectedNodeDragController({
  nodeId,
  enabled,
  onDragState,
  onPreview,
  onDrop
}: {
  nodeId?: string;
  enabled: boolean;
  onDragState: (active: boolean, nodeId: string) => void;
  onPreview: (nodeId: string, point: ScenePoint) => void;
  onDrop: (nodeId: string, point: ScenePoint) => void;
}): JSX.Element | null {
  const { gl, camera } = useThree();
  const interaction = useRef<DragInteraction>({ nodeId: "", pointerId: -1, startX: 0, startY: 0, dragging: false });
  const previewFrame = useRef<number | undefined>(undefined);
  const pendingPreview = useRef<ScenePoint | undefined>(undefined);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new Raycaster();
    const pointer = new Vector2();

    const toGroundPoint = (event: PointerEvent): ScenePoint | undefined => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const point = raycaster.ray.intersectPlane(GROUND_PLANE, new Vector3());
      return point ? snapWallDrawingPoint([point.x, point.z]) : undefined;
    };

    const clearInteraction = (): void => {
      const current = interaction.current;
      if (current.timer !== undefined) window.clearTimeout(current.timer);
      if (current.dragging) {
        onDragState(false, current.nodeId);
      }
      interaction.current = { nodeId: "", pointerId: -1, startX: 0, startY: 0, dragging: false };
    };

    const schedulePreview = (node: string, point: ScenePoint): void => {
      pendingPreview.current = point;
      if (previewFrame.current !== undefined) return;
      previewFrame.current = window.requestAnimationFrame(() => {
        previewFrame.current = undefined;
        if (pendingPreview.current) onPreview(node, pendingPreview.current);
      });
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!enabled || !nodeId || event.button !== 0) return;
      clearInteraction();
      const next: DragInteraction = { nodeId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
      next.timer = window.setTimeout(() => {
        if (interaction.current.pointerId !== event.pointerId) return;
        interaction.current.dragging = true;
        canvas.setPointerCapture(event.pointerId);
        onDragState(true, nodeId);
        const point = toGroundPoint(event);
        if (point) schedulePreview(nodeId, point);
      }, LONG_PRESS_DELAY_MS);
      interaction.current = next;
    };

    const onPointerMove = (event: PointerEvent): void => {
      const current = interaction.current;
      if (current.pointerId !== event.pointerId) return;
      if (!current.dragging) {
        if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > CANCEL_DISTANCE_PX) clearInteraction();
        return;
      }
      event.preventDefault();
      const point = toGroundPoint(event);
      if (point) schedulePreview(current.nodeId, point);
    };

    const onPointerUp = (event: PointerEvent): void => {
      const current = interaction.current;
      if (current.pointerId !== event.pointerId) return;
      const point = current.dragging ? toGroundPoint(event) : undefined;
      const node = current.nodeId;
      const wasDragging = current.dragging;
      clearInteraction();
      if (wasDragging && point) onDrop(node, point);
    };

    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointercancel", clearInteraction, true);
    return () => {
      clearInteraction();
      if (previewFrame.current !== undefined) window.cancelAnimationFrame(previewFrame.current);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", clearInteraction, true);
    };
  }, [camera, enabled, gl, nodeId, onDragState, onDrop, onPreview]);

  return null;
}
