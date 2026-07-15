/** Renders the wall-tool hit surface and non-persistent wall preview. */
import type { ThreeEvent } from "@react-three/fiber";
import type { JSX } from "react";
import type { ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";
import type { WallDrawingDraft } from "./useWallDrawing";
import { getWallViewportTransform } from "./sceneViewportMath";
import { isWallDrawingSegment } from "./wallDrawingMath";

const PREVIEW_HEIGHT = 2.8;
const PREVIEW_THICKNESS = 0.2;

export function WallDrawingOverlay({
  draft,
  onPoint,
  onPreview
}: {
  draft?: WallDrawingDraft;
  onPoint: (event: ThreeEvent<MouseEvent>) => void;
  onPreview: (event: ThreeEvent<MouseEvent>) => void;
}): JSX.Element {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          // R3F dispatches to every object hit by one ray; the drawing plane owns blank-space clicks.
          event.stopPropagation();
          onPoint(event);
        }}
        onPointerMove={onPreview}
      >
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {draft?.end && isWallDrawingSegment(draft.start, draft.end) ? (
        <WallDrawingPreview start={draft.start} end={draft.end} />
      ) : null}
    </group>
  );
}

function WallDrawingPreview({ start, end }: { start: ScenePoint; end: ScenePoint }): JSX.Element {
  const transform = getWallViewportTransform(start, end, PREVIEW_HEIGHT);

  return (
    <mesh position={transform.position} rotation={[0, transform.rotationY, 0]} renderOrder={1}>
      <boxGeometry args={[transform.length, PREVIEW_HEIGHT, PREVIEW_THICKNESS]} />
      <meshStandardMaterial color="#1677c8" transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}
