/** Applies validated scene commands without depending on Electron, React, or Pascal. */
import type {
  CreateWallCommandInput,
  SceneCommand,
  SceneCommandInput,
  SceneCommandResult,
  SceneNode,
  ScenePoint,
  SceneSnapshot,
  SceneWallNode,
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
  createId: () => string
): SceneCommandResult {
  switch (input.type) {
    case "wall.create":
      return createWallCommand(snapshot, input, createId);
    case "wall.update":
      return updateWallCommand(snapshot, input);
    case "node.delete":
      return deleteNodeCommand(snapshot, input);
  }
}

function createWallCommand(
  snapshot: SceneSnapshot,
  input: CreateWallCommandInput,
  createId: () => string
): SceneCommandResult {
  const parent = snapshot.nodes[input.parentId];
  if (!parent || parent.type !== "level") {
    return failure("invalid_parent", "墙体必须创建在有效楼层下。");
  }

  const id = input.id?.trim() || `wall_${createId()}`;
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

function deleteNodeCommand(snapshot: SceneSnapshot, input: Extract<SceneCommandInput, { type: "node.delete" }>): SceneCommandResult {
  const node = snapshot.nodes[input.id];
  if (!node) return failure("node_not_found", `未找到节点：${input.id}`);
  if (node.type !== "wall") return failure("unsupported_node", "当前仅支持删除墙体。");

  const nodes = { ...snapshot.nodes };
  delete nodes[input.id];
  return success(snapshot, input, nodes);
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

function isValidNodeId(id: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id);
}
