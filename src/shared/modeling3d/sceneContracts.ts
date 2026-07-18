/** Defines the framework-neutral scene model and commands shared by all processes. */

export type ScenePoint = [number, number];

export type WallMaterialPreset =
  | "brick"
  | "concrete"
  | "glass"
  | "marble"
  | "metal"
  | "plaster"
  | "tile"
  | "white"
  | "wood";

export interface SceneSiteNode {
  id: string;
  type: "site";
  name: string;
  parentId: null;
  polygon: ScenePoint[];
}

export interface SceneBuildingNode {
  id: string;
  type: "building";
  name: string;
  parentId: string;
}

export interface SceneLevelNode {
  id: string;
  type: "level";
  name: string;
  parentId: string;
  level: number;
}

export interface SceneSlabNode {
  id: string;
  type: "slab";
  name: string;
  parentId: string;
  polygon: ScenePoint[];
  elevation: number;
  materialPreset: WallMaterialPreset;
}

export interface SceneCeilingNode {
  id: string;
  type: "ceiling";
  name: string;
  parentId: string;
  polygon: ScenePoint[];
  height: number;
  materialPreset: WallMaterialPreset;
}

export type ColumnCrossSection = "round" | "square" | "rectangular";

export interface SceneColumnNode {
  id: string;
  type: "column";
  name: string;
  parentId: string;
  position: [number, number, number];
  crossSection: ColumnCrossSection;
  height: number;
  width: number;
  depth: number;
  materialPreset: WallMaterialPreset;
}

export interface SceneZoneNode {
  id: string;
  type: "zone";
  name: string;
  parentId: string;
  polygon: ScenePoint[];
  color: string;
}

export interface SceneStairNode {
  id: string;
  type: "stair";
  name: string;
  parentId: string;
  position: [number, number, number];
  rotation: number;
  width: number;
  totalRise: number;
  stepCount: number;
  thickness: number;
  railingMode: "none" | "left" | "right" | "both";
  materialPreset: WallMaterialPreset;
}

export type FenceStyle = "slat" | "rail" | "privacy";

/** A free-standing boundary element rendered by the editor's fence geometry. */
export interface SceneFenceNode {
  id: string;
  type: "fence";
  name: string;
  parentId: string;
  start: ScenePoint;
  end: ScenePoint;
  height: number;
  thickness: number;
  style: FenceStyle;
  materialPreset: WallMaterialPreset;
}

export interface SceneWallNode {
  id: string;
  type: "wall";
  name: string;
  parentId: string;
  start: ScenePoint;
  end: ScenePoint;
  height: number;
  thickness: number;
  materialPreset: WallMaterialPreset;
}

export interface SceneDoorNode {
  id: string;
  type: "door";
  name: string;
  parentId: string;
  wallId: string;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  materialPreset: WallMaterialPreset;
}

export interface SceneWindowNode {
  id: string;
  type: "window";
  name: string;
  parentId: string;
  wallId: string;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  materialPreset: WallMaterialPreset;
}

/** Imported meshes remain reference assets instead of being misrepresented as editable architecture. */
export interface SceneAssetNode {
  id: string;
  type: "asset";
  name: string;
  parentId: string;
  format: "glb" | "gltf" | "obj" | "stl";
  sourcePath: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  /** Local X/Z floor footprint in metres, used for deterministic placement collision checks. */
  footprint?: [number, number];
}

export type SceneNode = SceneSiteNode | SceneBuildingNode | SceneLevelNode | SceneSlabNode | SceneCeilingNode | SceneColumnNode | SceneZoneNode | SceneStairNode | SceneFenceNode | SceneWallNode | SceneDoorNode | SceneWindowNode | SceneAssetNode;

export interface SceneSnapshot {
  revision: number;
  rootNodeIds: string[];
  nodes: Record<string, SceneNode>;
}

export interface CreateWallCommandInput {
  type: "wall.create";
  id?: string;
  parentId: string;
  name?: string;
  start: ScenePoint;
  end: ScenePoint;
  height?: number;
  thickness?: number;
  materialPreset?: WallMaterialPreset;
}

export interface UpdateWallCommandInput {
  type: "wall.update";
  id: string;
  name?: string;
  start?: ScenePoint;
  end?: ScenePoint;
  height?: number;
  thickness?: number;
  materialPreset?: WallMaterialPreset;
}

export interface CreateSlabCommandInput {
  type: "slab.create";
  id?: string;
  parentId: string;
  name?: string;
  polygon: ScenePoint[];
  elevation?: number;
  materialPreset?: WallMaterialPreset;
}

export interface UpdateSlabCommandInput {
  type: "slab.update";
  id: string;
  name?: string;
  polygon?: ScenePoint[];
  elevation?: number;
  materialPreset?: WallMaterialPreset;
}

export interface CreateCeilingCommandInput {
  type: "ceiling.create";
  id?: string;
  parentId: string;
  name?: string;
  polygon: ScenePoint[];
  height?: number;
  materialPreset?: WallMaterialPreset;
}

export interface UpdateCeilingCommandInput {
  type: "ceiling.update";
  id: string;
  name?: string;
  polygon?: ScenePoint[];
  height?: number;
  materialPreset?: WallMaterialPreset;
}

export interface CreateColumnCommandInput {
  type: "column.create";
  id?: string;
  parentId: string;
  name?: string;
  position: [number, number, number];
  crossSection?: ColumnCrossSection;
  height?: number;
  width?: number;
  depth?: number;
  materialPreset?: WallMaterialPreset;
}

export interface UpdateColumnCommandInput {
  type: "column.update";
  id: string;
  name?: string;
  position?: [number, number, number];
  crossSection?: ColumnCrossSection;
  height?: number;
  width?: number;
  depth?: number;
  materialPreset?: WallMaterialPreset;
}

export interface CreateZoneCommandInput { type: "zone.create"; id?: string; parentId: string; name?: string; polygon: ScenePoint[]; color?: string; }
export interface UpdateZoneCommandInput { type: "zone.update"; id: string; name?: string; polygon?: ScenePoint[]; color?: string; }
export interface CreateStairCommandInput { type: "stair.create"; id?: string; parentId: string; name?: string; position: [number, number, number]; rotation?: number; width?: number; totalRise?: number; stepCount?: number; thickness?: number; railingMode?: SceneStairNode["railingMode"]; materialPreset?: WallMaterialPreset; }
export interface UpdateStairCommandInput { type: "stair.update"; id: string; name?: string; position?: [number, number, number]; rotation?: number; width?: number; totalRise?: number; stepCount?: number; thickness?: number; railingMode?: SceneStairNode["railingMode"]; materialPreset?: WallMaterialPreset; }
export interface CreateFenceCommandInput { type: "fence.create"; id?: string; parentId: string; name?: string; start: ScenePoint; end: ScenePoint; height?: number; thickness?: number; style?: FenceStyle; materialPreset?: WallMaterialPreset; }
export interface UpdateFenceCommandInput { type: "fence.update"; id: string; name?: string; start?: ScenePoint; end?: ScenePoint; height?: number; thickness?: number; style?: FenceStyle; materialPreset?: WallMaterialPreset; }

export interface CreateDoorCommandInput {
  type: "door.create";
  id?: string;
  wallId: string;
  name?: string;
  offset: number;
  width?: number;
  height?: number;
  sillHeight?: number;
  materialPreset?: WallMaterialPreset;
}

export interface UpdateDoorCommandInput {
  type: "door.update";
  id: string;
  offset?: number;
  name?: string;
  width?: number;
  height?: number;
  sillHeight?: number;
  materialPreset?: WallMaterialPreset;
}

export interface CreateWindowCommandInput {
  type: "window.create";
  id?: string;
  wallId: string;
  name?: string;
  offset: number;
  width?: number;
  height?: number;
  sillHeight?: number;
  materialPreset?: WallMaterialPreset;
}

export interface UpdateWindowCommandInput {
  type: "window.update";
  id: string;
  offset?: number;
  name?: string;
  width?: number;
  height?: number;
  sillHeight?: number;
  materialPreset?: WallMaterialPreset;
}

export interface DeleteNodeCommandInput {
  type: "node.delete";
  id: string;
}

/** Removes every descendant of one level while retaining the level itself. */
export interface ClearLevelCommandInput {
  type: "level.clear";
  levelId: string;
}

export interface CreateAssetCommandInput {
  type: "asset.create";
  id?: string;
  parentId: string;
  name?: string;
  format: SceneAssetNode["format"];
  sourcePath: string;
  position?: SceneAssetNode["position"];
  rotation?: SceneAssetNode["rotation"];
  scale?: SceneAssetNode["scale"];
  footprint?: SceneAssetNode["footprint"];
}

export interface UpdateAssetCommandInput {
  type: "asset.update";
  id: string;
  name?: string;
  position?: SceneAssetNode["position"];
  rotation?: SceneAssetNode["rotation"];
  scale?: SceneAssetNode["scale"];
  footprint?: SceneAssetNode["footprint"];
}

export type SceneCommandInput =
  | CreateWallCommandInput
  | UpdateWallCommandInput
  | CreateSlabCommandInput
  | UpdateSlabCommandInput
  | CreateCeilingCommandInput
  | UpdateCeilingCommandInput
  | CreateColumnCommandInput
  | UpdateColumnCommandInput
  | CreateZoneCommandInput
  | UpdateZoneCommandInput
  | CreateStairCommandInput
  | UpdateStairCommandInput
  | CreateFenceCommandInput
  | UpdateFenceCommandInput
  | CreateDoorCommandInput
  | UpdateDoorCommandInput
  | CreateWindowCommandInput
  | UpdateWindowCommandInput
  | CreateAssetCommandInput
  | UpdateAssetCommandInput
  | ClearLevelCommandInput
  | DeleteNodeCommandInput;

export type SceneCommand =
  | (CreateWallCommandInput & { id: string; name: string; height: number; thickness: number; materialPreset: WallMaterialPreset })
  | (CreateSlabCommandInput & { id: string; name: string; elevation: number; materialPreset: WallMaterialPreset })
  | (CreateCeilingCommandInput & { id: string; name: string; height: number; materialPreset: WallMaterialPreset })
  | (CreateColumnCommandInput & { id: string; name: string; crossSection: ColumnCrossSection; height: number; width: number; depth: number; materialPreset: WallMaterialPreset })
  | (CreateZoneCommandInput & { id: string; name: string; color: string })
  | (CreateStairCommandInput & { id: string; name: string; rotation: number; width: number; totalRise: number; stepCount: number; thickness: number; railingMode: SceneStairNode["railingMode"]; materialPreset: WallMaterialPreset })
  | (CreateFenceCommandInput & { id: string; name: string; height: number; thickness: number; style: FenceStyle; materialPreset: WallMaterialPreset })
  | (CreateDoorCommandInput & { id: string; name: string; width: number; height: number; sillHeight: number; materialPreset: WallMaterialPreset })
  | (CreateWindowCommandInput & { id: string; name: string; width: number; height: number; sillHeight: number; materialPreset: WallMaterialPreset })
  | (CreateAssetCommandInput & { id: string; name: string; position: SceneAssetNode["position"]; rotation: SceneAssetNode["rotation"]; scale: SceneAssetNode["scale"] })
  | UpdateAssetCommandInput
  | UpdateWallCommandInput
  | UpdateSlabCommandInput
  | UpdateCeilingCommandInput
  | UpdateColumnCommandInput
  | UpdateZoneCommandInput
  | UpdateStairCommandInput
  | UpdateFenceCommandInput
  | UpdateDoorCommandInput
  | UpdateWindowCommandInput
  | ClearLevelCommandInput
  | DeleteNodeCommandInput;

export interface SceneCommandSuccess {
  accepted: true;
  command: SceneCommand;
  snapshot: SceneSnapshot;
}

export interface SceneCommandFailure {
  accepted: false;
  code: "invalid_command" | "node_not_found" | "duplicate_node" | "invalid_parent" | "unsupported_node";
  message: string;
}

export type SceneCommandResult = SceneCommandSuccess | SceneCommandFailure;

export interface SceneHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface SceneHistoryResult extends SceneHistoryState {
  accepted: boolean;
  snapshot: SceneSnapshot;
}

export type SceneExchangeFormat = "scene-json" | "glb" | "gltf" | "obj" | "stl";

export interface SceneExportTarget { format: SceneExchangeFormat; path: string; }
export interface SceneAssetPayload { id: string; format: SceneAssetNode["format"]; dataBase64: string; }
export interface SceneImportResult { kind: "scene" | "asset"; name: string; snapshot: SceneSnapshot; }
