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

export type SceneNode = SceneSiteNode | SceneBuildingNode | SceneLevelNode | SceneSlabNode | SceneWallNode;

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

export interface DeleteNodeCommandInput {
  type: "node.delete";
  id: string;
}

export type SceneCommandInput = CreateWallCommandInput | UpdateWallCommandInput | DeleteNodeCommandInput;

export type SceneCommand =
  | (CreateWallCommandInput & { id: string; name: string; height: number; thickness: number; materialPreset: WallMaterialPreset })
  | UpdateWallCommandInput
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
