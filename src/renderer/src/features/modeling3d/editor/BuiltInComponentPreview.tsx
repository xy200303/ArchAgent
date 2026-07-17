/** Uses the shared icon library until an authoritative component asset catalog is available. */
import {
  Blinds,
  Box,
  BrickWall,
  Columns3,
  DoorOpen,
  Fence,
  PanelsTopLeft,
  SquareDashed,
  SquareStack,
  Workflow,
  type LucideIcon
} from "lucide-react";
import type { JSX } from "react";
import type { BuiltInComponentId } from "./componentLibraryContracts";

const COMPONENT_ICONS: Record<BuiltInComponentId, LucideIcon> = {
  wall: BrickWall,
  slab: SquareStack,
  ceiling: PanelsTopLeft,
  column: Columns3,
  zone: SquareDashed,
  stair: Workflow,
  fence: Fence,
  door: DoorOpen,
  window: Blinds
};

export function BuiltInComponentPreview({ componentId }: { componentId: BuiltInComponentId }): JSX.Element {
  const Icon = COMPONENT_ICONS[componentId] ?? Box;
  return <div className="component-built-in-preview" aria-hidden="true"><Icon size={28} strokeWidth={1.6} /></div>;
}
