/** Declares the renderer-level handoff from the component library to the scene editor. */
export type BuiltInComponentId = "wall" | "slab" | "ceiling" | "column" | "zone" | "stair" | "fence" | "door" | "window";

export interface ComponentLibraryRequest {
  componentId: BuiltInComponentId;
  revision: number;
}
