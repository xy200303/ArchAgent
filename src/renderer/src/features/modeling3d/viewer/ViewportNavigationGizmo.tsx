/** Hosts the legacy DOM canvas navigation gizmo beside the main R3F canvas. */
import { forwardRef, useEffect, useImperativeHandle, useRef, type JSX } from "react";
import { Quaternion } from "three";
import type { EditorCameraPreset } from "./R3FCameraControls";
import { NavigationGizmoRenderer } from "./NavigationGizmoRenderer";

export interface ViewportNavigationGizmoHandle {
  syncOrientation(quaternion: Quaternion): void;
}

export const ViewportNavigationGizmo = forwardRef<ViewportNavigationGizmoHandle, {
  onCameraPreset: (preset: EditorCameraPreset) => void;
  onOrbit: (deltaX: number, deltaY: number) => void;
}>(function ViewportNavigationGizmo({ onCameraPreset, onOrbit }, ref): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<NavigationGizmoRenderer | null>(null);
  const orientation = useRef(new Quaternion());
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean; preset?: EditorCameraPreset } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new NavigationGizmoRenderer(canvas);
    rendererRef.current = renderer;
    renderer.syncOrientation(orientation.current);
    const resizeObserver = new ResizeObserver(() => renderer.resize());
    resizeObserver.observe(canvas);
    return () => {
      resizeObserver.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    syncOrientation(quaternion): void {
      orientation.current.copy(quaternion);
      rendererRef.current?.syncOrientation(quaternion);
    }
  }), []);

  return <canvas ref={canvasRef} className="viewport-navigation-gizmo" aria-label="三维导航球：拖动可旋转相机，点击坐标轴可切换视图" role="application" onPointerDown={(event) => {
    const preset = rendererRef.current?.pick(event.clientX, event.clientY);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, preset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={(event) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - activeDrag.x;
    const deltaY = event.clientY - activeDrag.y;
    if (!deltaX && !deltaY) return;
    activeDrag.moved = activeDrag.moved || Math.abs(deltaX) + Math.abs(deltaY) > 2;
    activeDrag.x = event.clientX;
    activeDrag.y = event.clientY;
    if (activeDrag.moved) onOrbit(deltaX, deltaY);
  }} onPointerUp={(event) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    if (!activeDrag.moved && activeDrag.preset) onCameraPreset(activeDrag.preset);
  }} onPointerCancel={() => { drag.current = null; }} />;
});
