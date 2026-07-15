/** Declares the renderer-level handoff from the component library to the scene editor. */
export type BuiltInComponentId = "wall";

export interface ComponentLibraryRequest {
  componentId: BuiltInComponentId;
  revision: number;
}
