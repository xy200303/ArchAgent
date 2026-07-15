# ArchAgent 接口文档

## 1. 原则

Renderer、人工编辑工具和 Agent 不直接跨进程修改 Pascal store。所有持久化变更通过 Main 进程的 `SceneCommandService` 执行，并返回新 revision 与已应用 patch。

## 2. 共享类型

```ts
type ScenePatch = {
  baseRevision: number;
  source: "user" | "agent" | "system";
  changes: Array<
    | { op: "create"; node: Record<string, unknown>; parentId?: string }
    | { op: "update"; id: string; data: Record<string, unknown> }
    | { op: "delete"; id: string; cascade?: boolean }
    | { op: "asset.attach"; assetId: string; parentId?: string }
    | { op: "asset.update"; assetId: string; data: Record<string, unknown> }
  >;
};

type SceneCommandResult = {
  revision: number;
  applied: ScenePatch;
  affectedIds: string[];
  issues?: Array<{ path: string; message: string }>;
};
```

## 3. IPC

```ts
interface ArchAgentApi {
  modeling3d: {
    getScene(): Promise<{ revision: number; scene: SceneDocument }>;
    dryRunScenePatch(patch: ScenePatch): Promise<SceneCommandResult>;
    applyScenePatch(patch: ScenePatch): Promise<SceneCommandResult>;
    undoScene(): Promise<SceneCommandResult | null>;
    redoScene(): Promise<SceneCommandResult | null>;
    importAsset(input: { path: string }): Promise<{ assetId: string }>;
    exportScene(input: { format: "json" | "glb" | "stl" | "obj"; outputName: string }): Promise<{ path: string }>;
    onSceneChanged(listener: (event: SceneCommandResult) => void): () => void;
  };
}
```

`getScene` 用于初始化与 revision 冲突恢复；`onSceneChanged` 只传递已提交变更。Renderer 应按 revision 顺序投影到 Pascal `useScene`。

## 4. Agent 工具

首期为 Agent 暴露领域工具和一个受限的批量工具：

| 工具 | 用途 |
| --- | --- |
| `create_site` / `create_building` / `create_level` | 创建建筑层级 |
| `create_room` / `create_wall` / `create_slab` | 创建结构 |
| `place_door` / `place_window` / `place_item` | 添加开口或资产 |
| `update_node` / `set_material` / `delete_node` | 编辑节点 |
| `import_mesh_asset` / `update_mesh_asset` | 管理 GLB/OBJ 资产 |
| `apply_scene_patch` | 多步原子修改，支持 dry-run |
| `validate_scene` / `undo_scene` / `redo_scene` | 校验和历史 |

Agent 必须先读取当前场景摘要与 revision；结构化输入、图片识别结果或自然语言规划都必须归一为上述命令。图片分析只产生候选布局，不能绕过用户确认直接写入高风险结构。

## 5. 坐标与资产约定

建筑平面使用 Pascal 的右手坐标：X/Z 为地面，Y 为高度，单位为米。MeshAsset 保留源格式和材质槽信息，首次导入时复制到项目 `assets/`，并在场景中保存相对路径与变换；不在 IPC 中传递任意文件系统绝对路径。
