# ArchAgent 接口文档

## 1. 原则

Renderer、人工编辑工具和 Agent 不直接跨进程修改 Pascal store 或项目文件。所有建筑场景变更通过 Main 进程的 `SceneService` 执行；Pascal Viewer 只消费广播后的只读快照。产品没有 R3F/WebGL 编辑器回退。

## 2. 共享场景契约

```ts
type ScenePoint = [number, number];

type SceneCommandInput =
  | {
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
  | {
      type: "wall.update";
      id: string;
      name?: string;
      start?: ScenePoint;
      end?: ScenePoint;
      height?: number;
      thickness?: number;
      materialPreset?: WallMaterialPreset;
    }
  | { type: "node.delete"; id: string };

type SceneCommandResult =
  | { accepted: true; command: SceneCommand; snapshot: SceneSnapshot }
  | {
      accepted: false;
      code: "invalid_command" | "node_not_found" | "duplicate_node" | "invalid_parent" | "unsupported_node";
      message: string;
    };
```

当前 `SceneSnapshot` 使用 `rootNodeIds` 与扁平 `nodes` 保存 Site、Building、Level、Slab 与 Wall。坐标为米：X/Z 是建筑平面，Y 是高度。墙体只能创建在有效 Level 下；`node.delete` 当前只支持墙体。

## 3. IPC

```ts
interface ArchAgentApi {
  scene: {
    getSnapshot(): Promise<SceneSnapshot>;
    execute(command: SceneCommandInput): Promise<SceneCommandResult>;
  };
  events: {
    subscribe(listener: (event: RendererEvent) => void): () => void;
  };
}
```

`scene.execute` 成功后 Main 广播 `scene.command.applied`，其 payload 含已应用的命令和最新快照。Renderer 按事件更新 Pascal 场景投影；失败结果不修改快照，也不广播事件。

## 4. Agent 工具

| 工具 | 用途 |
| --- | --- |
| `get_scene` | 读取当前 revision、楼层和墙体摘要；更新或删除前必须调用 |
| `create_wall` | 在指定楼层创建直墙 |
| `update_wall` | 修改已存在墙体的名称、端点、尺寸或材质 |
| `delete_node` | 删除指定墙体 |

Agent 工具只把参数转换为 `SceneCommandInput` 并调用 `SceneService`。它不得直接写 Pascal store、创建未支持节点、声明已导入通用 Mesh，或声称导出了当前未提供的格式。场景命令成功后，Agent 应报告受影响节点 ID 与 snapshot revision。

## 5. 能力扩展

Door、Window、Slab、Zone、Ceiling、Roof 与材质扩展必须先新增共享命令、Reducer 校验、Pascal 映射和 UI 检查器，之后才能开放对应 Agent 工具。每个新工具都必须经过场景服务的同一条校验、历史和事件链路。
