/** Renders the R3F wall-tool hit surface and non-persistent preview. */
import type { ThreeEvent } from "@react-three/fiber";
import type { JSX } from "react";
import type { ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";
import type { WallDrawingDraft } from "./useWallDrawing";
import { getWallDrawingPreviewTransform, isWallDrawingSegment, snapWallDrawingPoint } from "./wallDrawingMath";

const PREVIEW_HEIGHT = 2.8;
const PREVIEW_THICKNESS = 0.2;

export function WallDrawingOverlay({
  draft,
  onPoint,
  onPreview
}: {
  draft?: WallDrawingDraft;
  onPoint: (point: ScenePoint) => void;
  onPreview: (point: ScenePoint) => void;
}): JSX.Element {
  const toScenePoint = (event: ThreeEvent<MouseEvent>): ScenePoint => snapWallDrawingPoint([event.point.x, event.point.z]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          if (event.nativeEvent.button !== 0) return;
          event.stopPropagation();
          onPoint(toScenePoint(event));
        }}
        onPointerMove={(event) => onPreview(toScenePoint(event))}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {draft?.end && isWallDrawingSegment(draft.start, draft.end) ? <WallDrawingPreview start={draft.start} end={draft.end} /> : null}
    </group>
  );
}

function WallDrawingPreview({ start, end }: { start: ScenePoint; end: ScenePoint }): JSX.Element {
  const transform = getWallDrawingPreviewTransform(start, end, PREVIEW_HEIGHT);

  return (
    <mesh position={transform.position} rotation={[0, transform.rotationY, 0]} renderOrder={1}>
      <boxGeometry args={[transform.length, PREVIEW_HEIGHT, PREVIEW_THICKNESS]} />
      <meshStandardMaterial color="#0f6cbd" transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}
