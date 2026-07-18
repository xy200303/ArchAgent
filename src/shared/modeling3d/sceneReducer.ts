/** Applies validated scene commands without depending on Electron or React. */
import type {
  CreateWallCommandInput,
  CreateSlabCommandInput,
  CreateCeilingCommandInput,
  CreateColumnCommandInput,
  CreateZoneCommandInput,
  CreateStairCommandInput,
  CreateFenceCommandInput,
  CreateDoorCommandInput,
  CreateWindowCommandInput,
  SceneCommand,
  SceneCommandInput,
  SceneCommandResult,
  SceneNode,
  ScenePoint,
  SceneSnapshot,
  SceneWallNode,
  SceneSlabNode,
  SceneCeilingNode,
  SceneColumnNode,
  SceneZoneNode,
  SceneStairNode,
  SceneFenceNode,
  SceneDoorNode,
  SceneWindowNode,
  SceneAssetNode,
  WallMaterialPreset
} from "./sceneContracts";

const MATERIAL_PRESETS: readonly WallMaterialPreset[] = [
  "brick",
  "concrete",
  "glass",
  "marble",
  "metal",
  "plaster",
  "tile",
  "white",
  "wood"
];

const DEFAULT_WALL_HEIGHT = 2.8;
const DEFAULT_WALL_THICKNESS = 0.2;

export function createDefaultScene(): SceneSnapshot {
  const nodes: SceneNode[] = [
    {
      id: "site_default",
      type: "site",
      name: "默认场地",
      parentId: null,
      polygon: [[-3, -3], [8, -3], [8, 7], [-3, 7]]
    },
    { id: "building_default", type: "building", name: "主建筑", parentId: "site_default" },
    { id: "level_default", type: "level", name: "一层", parentId: "building_default", level: 0 },
    {
      id: "slab_floor",
      type: "slab",
      name: "楼板",
      parentId: "level_default",
      polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
      elevation: 0,
      materialPreset: "concrete"
    },
    createWall("wall_north", "北墙", [0, 0], [5, 0]),
    createWall("wall_east", "东墙", [5, 0], [5, 4]),
    createWall("wall_south", "南墙", [5, 4], [0, 4]),
    createWall("wall_west", "西墙", [0, 4], [0, 0])
  ];

  return {
    revision: 0,
    rootNodeIds: ["site_default"],
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node]))
  };
}

export function applySceneCommand(
  snapshot: SceneSnapshot,
  input: SceneCommandInput,
  createId: (prefix: string) => string
): SceneCommandResult {
  switch (input.type) {
    case "wall.create":
      return createWallCommand(snapshot, input, createId);
    case "wall.update":
      return updateWallCommand(snapshot, input);
    case "slab.create":
      return createSlabCommand(snapshot, input, createId);
    case "slab.update":
      return updateSlabCommand(snapshot, input);
    case "ceiling.create":
      return createCeilingCommand(snapshot, input, createId);
    case "ceiling.update":
      return updateCeilingCommand(snapshot, input);
    case "column.create":
      return createColumnCommand(snapshot, input, createId);
    case "column.update":
      return updateColumnCommand(snapshot, input);
    case "zone.create":
      return createZoneCommand(snapshot, input, createId);
    case "zone.update":
      return updateZoneCommand(snapshot, input);
    case "stair.create":
      return createStairCommand(snapshot, input, createId);
    case "stair.update":
      return updateStairCommand(snapshot, input);
    case "fence.create":
      return createFenceCommand(snapshot, input, createId);
    case "fence.update":
      return updateFenceCommand(snapshot, input);
    case "door.create":
      return createDoorCommand(snapshot, input, createId);
    case "door.update":
      return updateDoorCommand(snapshot, input);
    case "window.create":
      return createWindowCommand(snapshot, input, createId);
    case "window.update":
      return updateWindowCommand(snapshot, input);
    case "asset.create":
      return createAssetCommand(snapshot, input, createId);
    case "asset.update":
      return updateAssetCommand(snapshot, input);
    case "node.delete":
      return deleteNodeCommand(snapshot, input);
    case "level.clear":
      return clearLevelCommand(snapshot, input);
  }
}

/** Creates a persisted reference mesh; mesh import never fabricates building semantics. */
function createAssetCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "asset.create" }>, createId: (prefix: string) => string): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") return failure("invalid_parent", "参考模型必须导入到有效楼层下。");
  if (!input.sourcePath.trim()) return failure("invalid_command", "参考模型文件路径不能为空。");
  const id = input.id?.trim() || `asset_${createId("asset")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `模型 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "模型 ID 只能包含字母、数字、下划线和连字符。");
  const asset: SceneAssetNode = { id, type: "asset", name: input.name?.trim() || `参考模型 ${countNodes(snapshot, "asset") + 1}`, parentId: input.parentId, format: input.format, sourcePath: input.sourcePath, position: input.position ?? [0, 0, 0], rotation: input.rotation ?? [0, 0, 0], scale: input.scale ?? [1, 1, 1], ...(input.footprint ? { footprint: input.footprint } : {}) };
  if (![...asset.position, ...asset.rotation, ...asset.scale].every(Number.isFinite) || asset.scale.some((value) => value <= 0) || (asset.footprint && (!asset.footprint.every(Number.isFinite) || asset.footprint.some((value) => value <= 0)))) return failure("invalid_command", "参考模型的变换或占地参数无效。");
  const command: SceneCommand = { type: "asset.create", id, parentId: asset.parentId, name: asset.name, format: asset.format, sourcePath: asset.sourcePath, position: asset.position, rotation: asset.rotation, scale: asset.scale, ...(asset.footprint ? { footprint: asset.footprint } : {}) };
  return success(snapshot, command, { ...snapshot.nodes, [id]: asset });
}

/** Updates placement only; externally imported triangles remain opaque reference data. */
function updateAssetCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "asset.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "asset") return failure("unsupported_node", "当前仅支持修改参考模型。");
  const asset: SceneAssetNode = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.position ? { position: input.position } : {}),
    ...(input.rotation ? { rotation: input.rotation } : {}),
    ...(input.scale ? { scale: input.scale } : {}),
    ...(input.footprint ? { footprint: input.footprint } : {})
  };
  if (!asset.name) return failure("invalid_command", "参考模型名称不能为空。");
  if (![...asset.position, ...asset.rotation, ...asset.scale].every(Number.isFinite) || asset.scale.some((value) => value <= 0) || (asset.footprint && (!asset.footprint.every(Number.isFinite) || asset.footprint.some((value) => value <= 0)))) return failure("invalid_command", "参考模型的变换或占地参数无效。");
  return success(snapshot, input, { ...snapshot.nodes, [asset.id]: asset });
}

function createDoorCommand(snapshot: SceneSnapshot, input: CreateDoorCommandInput, createId: (prefix: string) => string): SceneCommandResult {
  const id = input.id?.trim() || `door_${createId("door")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `门 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "门 ID 只能包含字母、数字、下划线和连字符。");
  const door: SceneDoorNode = {
    id,
    type: "door",
    name: input.name?.trim() || `门 ${countNodes(snapshot, "door") + 1}`,
    parentId: input.wallId,
    wallId: input.wallId,
    offset: input.offset,
    width: input.width ?? 0.9,
    height: input.height ?? 2.1,
    sillHeight: input.sillHeight ?? 0,
    materialPreset: input.materialPreset ?? "wood"
  };
  const validation = validateDoor(snapshot, door);
  if (validation) return failure("invalid_command", validation);
  const command: SceneCommand = { type: "door.create", id, wallId: door.wallId, name: door.name, offset: door.offset, width: door.width, height: door.height, sillHeight: door.sillHeight, materialPreset: door.materialPreset };
  return success(snapshot, command, { ...snapshot.nodes, [id]: door });
}

function updateDoorCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "door.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "door") return failure("unsupported_node", "当前仅支持修改门。 ");
  const door: SceneDoorNode = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.offset !== undefined ? { offset: input.offset } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.sillHeight !== undefined ? { sillHeight: input.sillHeight } : {}),
    ...(input.materialPreset ? { materialPreset: input.materialPreset } : {})
  };
  const validation = validateDoor(snapshot, door, door.id);
  if (validation) return failure("invalid_command", validation);
  return success(snapshot, input, { ...snapshot.nodes, [door.id]: door });
}

function createWindowCommand(snapshot: SceneSnapshot, input: CreateWindowCommandInput, createId: (prefix: string) => string): SceneCommandResult {
  const id = input.id?.trim() || `window_${createId("window")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `窗 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "窗 ID 只能包含字母、数字、下划线和连字符。");
  const window: SceneWindowNode = {
    id, type: "window", name: input.name?.trim() || `窗 ${countNodes(snapshot, "window") + 1}`,
    parentId: input.wallId, wallId: input.wallId, offset: input.offset,
    width: input.width ?? 1.2, height: input.height ?? 1.2, sillHeight: input.sillHeight ?? 0.9,
    materialPreset: input.materialPreset ?? "glass"
  };
  const validation = validateOpening(snapshot, window);
  if (validation) return failure("invalid_command", validation);
  const command: SceneCommand = { type: "window.create", id, wallId: window.wallId, name: window.name, offset: window.offset, width: window.width, height: window.height, sillHeight: window.sillHeight, materialPreset: window.materialPreset };
  return success(snapshot, command, { ...snapshot.nodes, [id]: window });
}

function updateWindowCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "window.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "window") return failure("unsupported_node", "当前仅支持修改窗。 ");
  const window: SceneWindowNode = { ...existing, ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.offset !== undefined ? { offset: input.offset } : {}), ...(input.width !== undefined ? { width: input.width } : {}), ...(input.height !== undefined ? { height: input.height } : {}), ...(input.sillHeight !== undefined ? { sillHeight: input.sillHeight } : {}), ...(input.materialPreset ? { materialPreset: input.materialPreset } : {}) };
  const validation = validateOpening(snapshot, window, window.id);
  if (validation) return failure("invalid_command", validation);
  return success(snapshot, input, { ...snapshot.nodes, [window.id]: window });
}

function createWallCommand(
  snapshot: SceneSnapshot,
  input: CreateWallCommandInput,
  createId: (prefix: string) => string
): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") {
    return failure("invalid_parent", "墙体必须创建在有效楼层下。");
  }

  const id = input.id?.trim() || `wall_${createId("wall")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `墙体 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "墙体 ID 只能包含字母、数字、下划线和连字符。");

  const wall = createWall(
    id,
    input.name?.trim() || `墙体 ${countWalls(snapshot) + 1}`,
    input.start,
    input.end,
    input.parentId,
    input.height,
    input.thickness,
    input.materialPreset
  );
  const validation = validateWall(wall);
  if (validation) return failure("invalid_command", validation);

  const command: SceneCommand = {
    type: "wall.create",
    id: wall.id,
    parentId: wall.parentId,
    name: wall.name,
    start: wall.start,
    end: wall.end,
    height: wall.height,
    thickness: wall.thickness,
    materialPreset: wall.materialPreset
  };
  return success(snapshot, command, { ...snapshot.nodes, [wall.id]: wall });
}

function createSlabCommand(
  snapshot: SceneSnapshot,
  input: CreateSlabCommandInput,
  createId: (prefix: string) => string
): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") {
    return failure("invalid_parent", "楼板必须创建在有效楼层下。");
  }

  const id = input.id?.trim() || `slab_${createId("slab")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `楼板 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "楼板 ID 只能包含字母、数字、下划线和连字符。");

  const slab: SceneSlabNode = {
    id,
    type: "slab",
    name: input.name?.trim() || `楼板 ${countSlabs(snapshot) + 1}`,
    parentId: input.parentId,
    polygon: input.polygon,
    elevation: input.elevation ?? 0,
    materialPreset: input.materialPreset ?? "concrete"
  };
  const validation = validateSlab(slab);
  if (validation) return failure("invalid_command", validation);

  const command: SceneCommand = {
    type: "slab.create",
    id: slab.id,
    parentId: slab.parentId,
    name: slab.name,
    polygon: slab.polygon,
    elevation: slab.elevation,
    materialPreset: slab.materialPreset
  };
  return success(snapshot, command, { ...snapshot.nodes, [slab.id]: slab });
}

function createCeilingCommand(
  snapshot: SceneSnapshot,
  input: CreateCeilingCommandInput,
  createId: (prefix: string) => string
): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") return failure("invalid_parent", "天花必须创建在有效楼层下。");

  const id = input.id?.trim() || `ceiling_${createId("ceiling")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `天花 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "天花 ID 只能包含字母、数字、下划线和连字符。");

  const ceiling: SceneCeilingNode = {
    id,
    type: "ceiling",
    name: input.name?.trim() || `天花 ${countNodes(snapshot, "ceiling") + 1}`,
    parentId: input.parentId,
    polygon: input.polygon,
    height: input.height ?? 2.8,
    materialPreset: input.materialPreset ?? "white"
  };
  const validation = validateCeiling(ceiling);
  if (validation) return failure("invalid_command", validation);
  const command: SceneCommand = { type: "ceiling.create", id, parentId: ceiling.parentId, name: ceiling.name, polygon: ceiling.polygon, height: ceiling.height, materialPreset: ceiling.materialPreset };
  return success(snapshot, command, { ...snapshot.nodes, [id]: ceiling });
}

function createColumnCommand(snapshot: SceneSnapshot, input: CreateColumnCommandInput, createId: (prefix: string) => string): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") return failure("invalid_parent", "柱必须创建在有效楼层下。");
  const id = input.id?.trim() || `column_${createId("column")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `柱 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "柱 ID 只能包含字母、数字、下划线和连字符。");
  const column: SceneColumnNode = {
    id, type: "column", name: input.name?.trim() || `柱 ${countNodes(snapshot, "column") + 1}`,
    parentId: input.parentId, position: input.position, crossSection: input.crossSection ?? "square",
    height: input.height ?? 2.8, width: input.width ?? 0.3, depth: input.depth ?? 0.3,
    materialPreset: input.materialPreset ?? "concrete"
  };
  const validation = validateColumn(column);
  if (validation) return failure("invalid_command", validation);
  const command: SceneCommand = { type: "column.create", id, parentId: column.parentId, name: column.name, position: column.position, crossSection: column.crossSection, height: column.height, width: column.width, depth: column.depth, materialPreset: column.materialPreset };
  return success(snapshot, command, { ...snapshot.nodes, [id]: column });
}

function createZoneCommand(snapshot: SceneSnapshot, input: CreateZoneCommandInput, createId: (prefix: string) => string): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") return failure("invalid_parent", "房间必须创建在有效楼层下。");
  const id = input.id?.trim() || `zone_${createId("zone")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `房间 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "房间 ID 只能包含字母、数字、下划线和连字符。");
  const zone: SceneZoneNode = { id, type: "zone", name: input.name?.trim() || `房间 ${countNodes(snapshot, "zone") + 1}`, parentId: input.parentId, polygon: input.polygon, color: input.color ?? "#0f6cbd" };
  const validation = validateZone(zone); if (validation) return failure("invalid_command", validation);
  return success(snapshot, { type: "zone.create", id, parentId: zone.parentId, name: zone.name, polygon: zone.polygon, color: zone.color }, { ...snapshot.nodes, [id]: zone });
}
function createStairCommand(
  snapshot: SceneSnapshot,
  input: CreateStairCommandInput,
  createId: (prefix: string) => string
): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") return failure("invalid_parent", "楼梯必须创建在有效楼层下。");

  const id = input.id?.trim() || `stair_${createId("stair")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `楼梯 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "楼梯 ID 只能包含字母、数字、下划线和连字符。");

  const stair: SceneStairNode = {
    id,
    type: "stair",
    name: input.name?.trim() || `楼梯 ${countNodes(snapshot, "stair") + 1}`,
    parentId: input.parentId,
    position: input.position,
    rotation: input.rotation ?? 0,
    width: input.width ?? 1.1,
    totalRise: input.totalRise ?? 2.8,
    stepCount: input.stepCount ?? 16,
    thickness: input.thickness ?? 0.16,
    railingMode: input.railingMode ?? "both",
    materialPreset: input.materialPreset ?? "concrete"
  };
  const validation = validateStair(stair);
  if (validation) return failure("invalid_command", validation);

  return success(snapshot, {
    type: "stair.create",
    id,
    parentId: stair.parentId,
    name: stair.name,
    position: stair.position,
    rotation: stair.rotation,
    width: stair.width,
    totalRise: stair.totalRise,
    stepCount: stair.stepCount,
    thickness: stair.thickness,
    railingMode: stair.railingMode,
    materialPreset: stair.materialPreset
  }, { ...snapshot.nodes, [id]: stair });
}

function createFenceCommand(
  snapshot: SceneSnapshot,
  input: CreateFenceCommandInput,
  createId: (prefix: string) => string
): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") return failure("invalid_parent", "围栏必须创建在有效楼层下。");

  const id = input.id?.trim() || `fence_${createId("fence")}`;
  if (snapshot.nodes[id]) return failure("duplicate_node", `围栏 ID 已存在：${id}`);
  if (!isValidNodeId(id)) return failure("invalid_command", "围栏 ID 只能包含字母、数字、下划线和连字符。");

  const fence: SceneFenceNode = {
    id,
    type: "fence",
    name: input.name?.trim() || `围栏 ${countNodes(snapshot, "fence") + 1}`,
    parentId: input.parentId,
    start: input.start,
    end: input.end,
    height: input.height ?? 1.1,
    thickness: input.thickness ?? 0.08,
    style: input.style ?? "slat",
    materialPreset: input.materialPreset ?? "metal"
  };
  const validation = validateFence(fence);
  if (validation) return failure("invalid_command", validation);

  return success(snapshot, {
    type: "fence.create",
    id,
    parentId: fence.parentId,
    name: fence.name,
    start: fence.start,
    end: fence.end,
    height: fence.height,
    thickness: fence.thickness,
    style: fence.style,
    materialPreset: fence.materialPreset
  }, { ...snapshot.nodes, [id]: fence });
}

function updateWallCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "wall.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "wall") return failure("unsupported_node", "当前仅支持修改墙体。");

  const wall: SceneWallNode = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.start ? { start: input.start } : {}),
    ...(input.end ? { end: input.end } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.thickness !== undefined ? { thickness: input.thickness } : {}),
    ...(input.materialPreset ? { materialPreset: input.materialPreset } : {})
  };
  const validation = validateWall(wall);
  if (validation) return failure("invalid_command", validation);

  return success(snapshot, input, { ...snapshot.nodes, [wall.id]: wall });
}

function updateSlabCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "slab.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "slab") return failure("unsupported_node", "当前仅支持修改楼板。");

  const slab: SceneSlabNode = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.polygon ? { polygon: input.polygon } : {}),
    ...(input.elevation !== undefined ? { elevation: input.elevation } : {}),
    ...(input.materialPreset ? { materialPreset: input.materialPreset } : {})
  };
  const validation = validateSlab(slab);
  if (validation) return failure("invalid_command", validation);

  return success(snapshot, input, { ...snapshot.nodes, [slab.id]: slab });
}

function updateCeilingCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "ceiling.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "ceiling") return failure("unsupported_node", "当前仅支持修改天花。");
  const ceiling: SceneCeilingNode = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.polygon ? { polygon: input.polygon } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.materialPreset ? { materialPreset: input.materialPreset } : {})
  };
  const validation = validateCeiling(ceiling);
  if (validation) return failure("invalid_command", validation);
  return success(snapshot, input, { ...snapshot.nodes, [ceiling.id]: ceiling });
}

function updateColumnCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "column.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "column") return failure("unsupported_node", "当前仅支持修改柱。 ");
  const column: SceneColumnNode = { ...existing, ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.position ? { position: input.position } : {}), ...(input.crossSection ? { crossSection: input.crossSection } : {}), ...(input.height !== undefined ? { height: input.height } : {}), ...(input.width !== undefined ? { width: input.width } : {}), ...(input.depth !== undefined ? { depth: input.depth } : {}), ...(input.materialPreset ? { materialPreset: input.materialPreset } : {}) };
  const validation = validateColumn(column);
  if (validation) return failure("invalid_command", validation);
  return success(snapshot, input, { ...snapshot.nodes, [column.id]: column });
}

function updateZoneCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "zone.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id]; if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "zone") return failure("unsupported_node", "当前仅支持修改房间。 ");
  const zone: SceneZoneNode = { ...existing, ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.polygon ? { polygon: input.polygon } : {}), ...(input.color !== undefined ? { color: input.color } : {}) };
  const validation = validateZone(zone); if (validation) return failure("invalid_command", validation);
  return success(snapshot, input, { ...snapshot.nodes, [zone.id]: zone });
}
function updateStairCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "stair.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "stair") return failure("unsupported_node", "当前仅支持修改楼梯。");

  const stair: SceneStairNode = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.position ? { position: input.position } : {}),
    ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.totalRise !== undefined ? { totalRise: input.totalRise } : {}),
    ...(input.stepCount !== undefined ? { stepCount: input.stepCount } : {}),
    ...(input.thickness !== undefined ? { thickness: input.thickness } : {}),
    ...(input.railingMode ? { railingMode: input.railingMode } : {}),
    ...(input.materialPreset ? { materialPreset: input.materialPreset } : {})
  };
  const validation = validateStair(stair);
  if (validation) return failure("invalid_command", validation);
  return success(snapshot, input, { ...snapshot.nodes, [stair.id]: stair });
}

function updateFenceCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "fence.update" }>): SceneCommandResult {
  const existing = snapshot.nodes[input.id];
  if (!existing) return failure("node_not_found", `未找到节点：${input.id}`);
  if (existing.type !== "fence") return failure("unsupported_node", "当前仅支持修改围栏。");

  const fence: SceneFenceNode = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.start ? { start: input.start } : {}),
    ...(input.end ? { end: input.end } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.thickness !== undefined ? { thickness: input.thickness } : {}),
    ...(input.style ? { style: input.style } : {}),
    ...(input.materialPreset ? { materialPreset: input.materialPreset } : {})
  };
  const validation = validateFence(fence);
  if (validation) return failure("invalid_command", validation);
  return success(snapshot, input, { ...snapshot.nodes, [fence.id]: fence });
}

function deleteNodeCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "node.delete" }>): SceneCommandResult {
  const node = snapshot.nodes[input.id];
  if (!node) return failure("node_not_found", `未找到节点：${input.id}`);
  if (node.type !== "wall" && node.type !== "slab" && node.type !== "ceiling" && node.type !== "column" && node.type !== "zone" && node.type !== "stair" && node.type !== "fence" && node.type !== "door" && node.type !== "window" && node.type !== "asset") return failure("unsupported_node", "当前仅支持删除建筑构件或参考模型。");

  const nodeIdsToDelete = collectDescendantNodeIds(snapshot, input.id);
  nodeIdsToDelete.add(input.id);
  const nodes = { ...snapshot.nodes };
  for (const id of nodeIdsToDelete) delete nodes[id];
  return success(snapshot, input, nodes);
}

/** Deletes a level's complete component subtree as one undoable scene command. */
function clearLevelCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "level.clear" }>): SceneCommandResult {
  const level = snapshot.nodes[input.levelId];
  if (!level) return failure("node_not_found", `未找到楼层：${input.levelId}`);
  if (level.type !== "level") return failure("invalid_command", "只能清空楼层节点。");

  const nodeIdsToDelete = collectDescendantNodeIds(snapshot, level.id);
  const nodes = { ...snapshot.nodes };
  for (const id of nodeIdsToDelete) delete nodes[id];
  return success(snapshot, input, nodes);
}

function collectDescendantNodeIds(snapshot: SceneSnapshot, parentId: string): Set<string> {
  const nodeIds = new Set<string>();
  const pendingParentIds = [parentId];
  while (pendingParentIds.length) {
    const currentParentId = pendingParentIds.pop();
    if (!currentParentId) continue;
    for (const node of Object.values(snapshot.nodes)) {
      if (node.parentId !== currentParentId || nodeIds.has(node.id)) continue;
      nodeIds.add(node.id);
      pendingParentIds.push(node.id);
    }
  }
  return nodeIds;
}

function createWall(
  id: string,
  name: string,
  start: ScenePoint,
  end: ScenePoint,
  parentId = "level_default",
  height = DEFAULT_WALL_HEIGHT,
  thickness = DEFAULT_WALL_THICKNESS,
  materialPreset: WallMaterialPreset = "plaster"
): SceneWallNode {
  return { id, type: "wall", name, parentId, start, end, height, thickness, materialPreset };
}

function validateWall(wall: SceneWallNode): string | undefined {
  if (!wall.name.trim()) return "墙体名称不能为空。";
  if (!isFinitePoint(wall.start) || !isFinitePoint(wall.end)) return "墙体端点必须是有限数字。";
  if (distance(wall.start, wall.end) < 0.01) return "墙体长度必须大于 0.01 米。";
  if (!isFinitePositive(wall.height)) return "墙高必须是大于 0 的有限数字。";
  if (!isFinitePositive(wall.thickness)) return "墙厚必须是大于 0 的有限数字。";
  if (!MATERIAL_PRESETS.includes(wall.materialPreset)) return "墙体材质预设无效。";
  return undefined;
}

/** Validates a simple, non-degenerate floor footprint before rendering. */
function validateSlab(slab: SceneSlabNode): string | undefined {
  if (!slab.name.trim()) return "楼板名称不能为空。";
  if (slab.polygon.length < 3 || !slab.polygon.every(isFinitePoint)) return "楼板轮廓至少需要三个有限坐标点。";
  if (Math.abs(polygonArea(slab.polygon)) < 0.01) return "楼板轮廓面积必须大于 0.01 平方米。";
  if (!Number.isFinite(slab.elevation)) return "楼板标高必须是有限数字。";
  if (!MATERIAL_PRESETS.includes(slab.materialPreset)) return "楼板材质预设无效。";
  return undefined;
}

function validateCeiling(ceiling: SceneCeilingNode): string | undefined {
  if (!ceiling.name.trim()) return "天花名称不能为空。";
  if (ceiling.polygon.length < 3 || !ceiling.polygon.every(isFinitePoint)) return "天花轮廓至少需要三个有限坐标点。";
  if (Math.abs(polygonArea(ceiling.polygon)) < 0.01) return "天花轮廓面积必须大于 0.01 平方米。";
  if (!isFinitePositive(ceiling.height)) return "天花高度必须是大于 0 的有限数字。";
  if (!MATERIAL_PRESETS.includes(ceiling.materialPreset)) return "天花材质预设无效。";
  return undefined;
}

function validateColumn(column: SceneColumnNode): string | undefined {
  if (!column.name.trim()) return "柱名称不能为空。";
  if (column.position.length !== 3 || !column.position.every(Number.isFinite)) return "柱位置必须是三个有限数字。";
  if (!isFinitePositive(column.height) || !isFinitePositive(column.width) || !isFinitePositive(column.depth)) return "柱的高度、宽度和进深必须大于 0。";
  if (!MATERIAL_PRESETS.includes(column.materialPreset)) return "柱材质预设无效。";
  return undefined;
}
function validateZone(zone: SceneZoneNode): string | undefined {
  if (!zone.name.trim()) return "房间名称不能为空。";
  if (zone.polygon.length < 3 || !zone.polygon.every(isFinitePoint) || Math.abs(polygonArea(zone.polygon)) < 0.01) return "房间轮廓必须是面积大于 0.01 平方米的有效多边形。";
  if (!/^#[0-9a-fA-F]{6}$/.test(zone.color)) return "房间颜色必须是 #RRGGBB。";
  return undefined;
}

function validateStair(stair: SceneStairNode): string | undefined {
  if (!stair.name.trim()) return "楼梯名称不能为空。";
  if (stair.position.length !== 3 || !stair.position.every(Number.isFinite)) return "楼梯位置必须是三个有限数字。";
  if (![stair.rotation, stair.width, stair.totalRise, stair.thickness].every(Number.isFinite)) return "楼梯尺寸必须是有限数字。";
  if (stair.width <= 0 || stair.totalRise <= 0 || stair.thickness <= 0) return "楼梯宽度、总高度和板厚必须大于 0。";
  if (!Number.isInteger(stair.stepCount) || stair.stepCount < 2) return "楼梯踏步数必须是至少为 2 的整数。";
  if (!MATERIAL_PRESETS.includes(stair.materialPreset)) return "楼梯材质预设无效。";
  return undefined;
}

function validateFence(fence: SceneFenceNode): string | undefined {
  if (!fence.name.trim()) return "围栏名称不能为空。";
  if (!isFinitePoint(fence.start) || !isFinitePoint(fence.end)) return "围栏端点必须是有限数字。";
  if (distance(fence.start, fence.end) < 0.01) return "围栏长度必须大于 0.01 米。";
  if (!isFinitePositive(fence.height) || !isFinitePositive(fence.thickness)) return "围栏高度和厚度必须大于 0。";
  if (fence.style !== "slat" && fence.style !== "rail" && fence.style !== "privacy") return "围栏样式无效。";
  if (!MATERIAL_PRESETS.includes(fence.materialPreset)) return "围栏材质预设无效。";
  return undefined;
}

function success(snapshot: SceneSnapshot, command: SceneCommand, nodes: Record<string, SceneNode>): SceneCommandResult {
  return {
    accepted: true,
    command,
    snapshot: { revision: snapshot.revision + 1, rootNodeIds: [...snapshot.rootNodeIds], nodes }
  };
}

function failure(code: Extract<SceneCommandResult, { accepted: false }> ["code"], message: string): SceneCommandResult {
  return { accepted: false, code, message };
}

function isFinitePoint(point: ScenePoint): boolean {
  return point.length === 2 && point.every((value) => Number.isFinite(value));
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function distance(start: ScenePoint, end: ScenePoint): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

function countWalls(snapshot: SceneSnapshot): number {
  return Object.values(snapshot.nodes).filter((node) => node.type === "wall").length;
}

function countSlabs(snapshot: SceneSnapshot): number {
  return Object.values(snapshot.nodes).filter((node) => node.type === "slab").length;
}

function countNodes(snapshot: SceneSnapshot, type: SceneNode["type"]): number {
  return Object.values(snapshot.nodes).filter((node) => node.type === type).length;
}

function validateDoor(snapshot: SceneSnapshot, door: SceneDoorNode, excludedId?: string): string | undefined {
  return validateOpening(snapshot, door, excludedId);
}

function validateOpening(snapshot: SceneSnapshot, opening: SceneDoorNode | SceneWindowNode, excludedId?: string): string | undefined {
  const label = opening.type === "door" ? "门" : "窗";
  const wall = snapshot.nodes[opening.wallId];
  if (!wall || wall.type !== "wall") return `${label}必须绑定到有效墙体。`;
  if (!opening.name.trim()) return `${label}名称不能为空。`;
  if (![opening.offset, opening.width, opening.height, opening.sillHeight].every(Number.isFinite) || opening.width <= 0 || opening.height <= 0 || opening.sillHeight < 0) return `${label}的尺寸与偏移必须是有效的非负数字。`;
  const wallLength = distance(wall.start, wall.end);
  if (opening.offset < 0.05 || opening.offset + opening.width > wallLength - 0.05) return `${label}洞必须保留至少 0.05 米墙端余量。`;
  if (opening.sillHeight + opening.height > wall.height) return `${label}洞高度不能超过墙高。`;
  const overlaps = Object.values(snapshot.nodes).some((node) => (node.type === "door" || node.type === "window") && node.wallId === opening.wallId && node.id !== excludedId && intervalsOverlap(opening.offset, opening.offset + opening.width, node.offset, node.offset + node.width));
  if (overlaps) return `${label}洞不能与同一墙体上的已有洞口重叠。`;
  if (!MATERIAL_PRESETS.includes(opening.materialPreset)) return `${label}材质预设无效。`;
  return undefined;
}

function intervalsOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
}

function polygonArea(points: ScenePoint[]): number {
  return points.reduce((area, point, index) => {
    const nextPoint = points[(index + 1) % points.length];
    return area + point[0] * nextPoint[1] - nextPoint[0] * point[1];
  }, 0) / 2;
}

function isValidNodeId(id: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id);
}
