# ArchAgent编辑器设计方案

## 1. 设计目标

为 ArchAgent设计并实现一套自研的建筑/房间 3D 编辑工具。编辑工具不直接依赖 Aedifex 的 npm 包（其未发布），而是参考其 `packages/editor` 的交互逻辑与 `packages/mcp` 的工具设计，结合 `@pascal-app/core` 与 `@pascal-app/viewer` 实现。

核心目标：

1. 提供类似 Blender 的 3D 编辑器体验，但专注于建筑/房间场景。
2. 工具与对话系统解耦：用户既可以直接在 3D 视口操作，也可以通过右侧对话让 Agent 调用工具。
3. 所有编辑操作最终都落回到 `@pascal-app/core` 的节点数据模型。
4. 支持选择、移动、旋转、缩放等基础变换，以及画墙、放门窗、放家具等建筑专用工具。
5. 编辑操作支持撤销重做。

## 2. 参考来源

### 2.1 Aedifex `packages/editor`

Aedifex 是 Pascal Editor 的增强 fork，其 `packages/editor` 包含：

- **Tools**：SelectTool、WallTool、ZoneTool、ItemTool、SlabTool 等。
- **Selection Manager**：层级化选择策略（Site → Building → Level → Zone → Item）。
- **Editor State**：active tool、layer visibility、panel states 等。
- **Custom Camera Controls**：聚焦对象、多视角切换。
- **AI Assistant UI**：prompt 输入、ghost preview、agent loop 展示。

参考点：

1. 工具激活/切换模式：每个工具独立处理鼠标/键盘事件，不与 viewer 渲染逻辑耦合。
2. 选择管理器：根据当前选择层级决定 hover/click 行为。
3. 编辑状态与场景状态分离：`useEditor` 管理 UI 状态，`useScene` 管理节点数据。

### 2.2 Aedifex `packages/mcp`

Aedifex 的 `packages/mcp` 暴露了大量场景操作工具，供 Claude Desktop / Cursor 通过 MCP 调用。其设计思路：

1. 每个建筑操作对应一个 MCP tool（如 `create_wall`、`place_door`、`update_window`）。
2. 工具参数使用 Zod schema 校验。
3. 工具执行后返回操作结果和受影响的节点 ID。
4. AI 可以调用多个工具完成复杂指令，并能在出错时自动修正。
5. 支持 ghost preview：先创建临时节点，用户确认后再固化。

参考点：

1. 工具清单设计。
2. 参数命名与校验方式。
3. 错误处理与自动修正循环。
4. Ghost preview 的交互流程。

## 3. 编辑器架构

```mermaid
graph TB
    subgraph 前端
        UI[工具栏 / 属性面板 / 场景树]
        VP[3D Viewport @pascal-app/viewer]
        EV[Editor State Zustand]
    end
    subgraph 主进程
        MCP[MCP Tools / Agent Tools]
        PS[@pascal-app/core Scene Store]
        EX[导出引擎]
    end
    UI --> EV
    EV --> MCP
    VP --> PS
    MCP --> PS
    PS --> VP
    PS --> EX
```

### 3.1 分层职责

| 层级 | 职责 |
| --- | --- |
| `Viewer` | 只负责渲染场景，不处理编辑逻辑 |
| `Editor State` | 管理当前激活工具、选择集、变换状态、面板状态 |
| `Tools` | 根据当前工具处理用户输入，生成节点操作意图 |
| `MCP / Agent Tools` | 将操作意图转换为对 `@pascal-app/core` store 的修改 |
| `Scene Store` | 节点 CRUD、dirty marking、undo/redo |
| `Export Engine` | 将场景导出为 GLB / STL / OBJ / JSON |

## 4. 工具清单

### 4.1 视口交互工具

| 工具 | 快捷键 | 功能 |
| --- | --- | --- |
| SelectTool | Q / Esc | 选择对象；拖拽移动；显示变换 gizmo |
| MoveTool | W | 对选中对象进行平移 |
| RotateTool | E | 对选中对象进行旋转 |
| ScaleTool | R | 对选中对象进行缩放 |
| OrbitTool | 右键拖拽 | 旋转相机 |
| PanTool | 中键拖拽 / Shift+右键 | 平移相机 |
| ZoomTool | 滚轮 | 缩放相机 |

### 4.2 建筑创建工具

| 工具 | 功能 |
| --- | --- |
| WallTool | 点击拖拽绘制墙体，自动连接到已有墙端点 |
| DoorTool | 在墙上点击放置门，可调整宽度、高度、开启方向 |
| WindowTool | 在墙上点击放置窗，可调整宽度、高度、离地高度 |
| SlabTool | 绘制楼板多边形，自动根据墙边界闭合 |
| CeilingTool | 为当前 Level 生成天花板 |
| RoofTool | 为建筑生成屋顶 |
| ZoneTool | 根据墙体围合自动检测房间区域 |
| ItemTool | 从家具目录选择并放置家具 |
| LightTool | 添加环境光、方向光、点光源 |
| CameraTool | 添加保存相机视角 |

### 4.3 编辑操作

| 操作 | 功能 |
| --- | --- |
| Delete | 删除选中节点 |
| Duplicate | 复制选中节点 |
| Hide / Show | 控制节点可见性 |
| Focus | 相机聚焦到选中对象 |
| Isolate | 单独显示选中子树 |
| Snap to Grid | 网格吸附开关 |
| Undo / Redo | 撤销重做 |

## 5. 选择管理器

参考 Aedifex 的层级化选择策略：

```
Site → Building → Level → Zone → Item
```

行为规则：

1. 当前未选择任何对象时，点击选择最高层级（Site / Building / Level）。
2. 已选择 Level 时，点击 Wall / Slab / Zone 选择该节点。
3. 已选择 Wall 时，点击其上的 Door / Window 选择子节点。
4. Ctrl / Cmd + 点击支持多选同级节点。
5. 空区域点击取消选择。

选择状态存储在 Editor State 中，viewer 通过高亮/边框反馈。

## 6. MCP / Agent 工具设计

### 6.1 工具清单

| 工具名 | 用途 |
| --- | --- |
| `create_site` | 创建场地根节点 |
| `create_building` | 在 site 下创建建筑 |
| `create_level` | 在 building 下创建楼层 |
| `create_wall` | 创建墙体 |
| `update_wall` | 修改墙体端点、高度、厚度 |
| `delete_wall` | 删除墙体 |
| `place_door` | 在墙上放置门 |
| `update_door` | 修改门尺寸、位置、开启方向 |
| `place_window` | 在墙上放置窗 |
| `update_window` | 修改窗尺寸、位置 |
| `create_slab` | 创建楼板 |
| `create_zone` | 创建或更新房间区域 |
| `place_item` | 放置家具 |
| `update_item` | 修改家具位置、旋转、缩放 |
| `set_material` | 设置节点材质 |
| `export_scene` | 导出场景为指定格式 |
| `load_scene` | 从 JSON 加载场景 |

### 6.2 工具调用流程

```
用户输入
    ↓
Agent 规划：需要创建哪些节点
    ↓
调用 create_level / create_wall / place_door ...
    ↓
Zod 校验参数
    ↓
写入 @pascal-app/core store
    ↓
节点被标记为 dirty
    ↓
WallSystem / DoorSystem 更新几何
    ↓
Viewer 重新渲染
    ↓
返回结果给 Agent 和用户
```

### 6.3 Ghost Preview 流程

```
Agent 提出建议
    ↓
创建 ghost 节点（半透明、不可选择、不持久化）
    ↓
用户在 3D 视口看到半透明预览
    ↓
用户确认 / 修改 / 取消
    ↓
确认后：ghost 节点转为正式节点
    ↓
取消后：删除 ghost 节点
```

Ghost 节点通过 `metadata.isGhost = true` 标记，渲染时降低透明度，不计入导出和持久化。

## 7. 属性面板

选中节点后，属性面板展示可编辑属性：

### 7.1 WallNode

- 起点 / 终点坐标
- 高度
- 厚度
- 材质
- 是否有踢脚线

### 7.2 DoorNode / WindowNode

- 宽度
- 高度
- 沿墙位置（距离墙起点距离）
- 离地高度（窗）
- 开启方向（门）
- 材质

### 7.3 SlabNode

- 多边形顶点
- 厚度
- 离地高度
- 材质

### 7.4 ItemNode

- 位置（x, y, z）
- 旋转（rx, ry, rz）
- 缩放（sx, sy, sz）
- 材质
- 目录 ID

## 8. 场景树面板

场景树以层级方式展示：

```
Site
└── Building
    └── Level 1
        ├── Walls
        │   ├── Wall-1
        │   ├── Wall-2
        │   └── ...
        ├── Doors
        ├── Windows
        ├── Slabs
        ├── Zones
        └── Items
```

支持：

- 展开 / 折叠
- 点击选择
- 右键菜单（重命名、删除、隐藏、聚焦）
- 拖拽排序（同层级）

## 9. 撤销重做

基于 `@pascal-app/core` 内置的 Zundo 中间件。

- 每次 `createNode` / `updateNode` / `deleteNode` 自动记录历史。
- 撤销重做按钮在工具栏。
- 快捷键：Ctrl+Z / Ctrl+Y。
- Ghost preview 操作不进入历史栈，确认后才记录。

## 10. 与对话系统的集成

```
用户：把客厅宽度从 4 米改成 5 米
    ↓
Agent 识别：需要修改 level_1 中相关墙体端点
    ↓
Agent 调用 update_wall（多个）
    ↓
场景实时更新
    ↓
Agent 回复：已调整客厅宽度，您可以继续修改
```

关键设计：

1. Agent 不直接操作 store，而是通过 MCP/Agent 工具。
2. 工具执行结果以 `stream.item` 形式展示在对话流中。
3. 3D 视口和对话流双向同步：用户在视口修改后，对话流显示操作摘要；Agent 修改后，视口实时更新。

## 11. 文件组织

```
src/renderer/src/features/modeling3d/
├── editor/
│   ├── EditorState.ts          # Zustand store：工具、选择、面板
│   ├── ToolManager.ts          # 工具注册与事件分发
│   ├── tools/
│   │   ├── SelectTool.ts
│   │   ├── MoveTool.ts
│   │   ├── RotateTool.ts
│   │   ├── ScaleTool.ts
│   │   ├── WallTool.ts
│   │   ├── DoorTool.ts
│   │   ├── WindowTool.ts
│   │   ├── SlabTool.ts
│   │   ├── ZoneTool.ts
│   │   ├── ItemTool.ts
│   │   └── index.ts
│   ├── panels/
│   │   ├── SceneTreePanel.tsx
│   │   ├── PropertyPanel.tsx
│   │   ├── Toolbar.tsx
│   │   └── index.ts
│   └── gizmos/
│       ├── TransformGizmo.tsx
│       └── SelectionHighlight.tsx
├── viewer/
│   ├── PascalViewer.tsx        # 包装 @pascal-app/viewer
│   └── ViewerOverlay.tsx       # 网格、指南针、状态文本
├── mcp/
│   ├── tools/
│   │   ├── createWall.ts
│   │   ├── placeDoor.ts
│   │   ├── updateWindow.ts
│   │   └── ...
│   ├── schemas.ts
│   └── index.ts
└── shared/
    ├── types.ts
    └── constants.ts
```

## 12. 实施优先级

1. **P0**：SelectTool + 3D 视口选择 + 属性面板（位置/旋转/缩放）。
2. **P0**：WallTool + DoorTool + WindowTool + 基础场景树。
3. **P1**：SlabTool + ZoneTool + 撤销重做。
4. **P1**：Agent MCP 工具集（create_wall / place_door / update_window 等）。
5. **P2**：ItemTool + 家具目录 + 材质面板。
6. **P2**：Ghost preview + AI assistant UI。
7. **P3**：RoofTool + CeilingTool + 街景漫游。

## 13. 关键交互细节

### 13.1 画墙

1. 激活 WallTool。
2. 鼠标在 ground plane 上移动，显示橡皮筋预览线。
3. 点击确定墙起点。
4. 移动鼠标，预览线跟随；靠近已有墙端点时吸附。
5. 再次点击确定墙终点，创建 WallNode。
6. 连续画墙：以上一条墙终点为下一条墙起点。
7. 按 Esc 结束连续画墙。

### 13.2 放门窗

1. 激活 DoorTool / WindowTool。
2. 鼠标在墙上移动，显示预览轮廓。
3. 点击确定放置位置，创建 DoorNode / WindowNode。
4. 新节点作为被点击墙的子节点。

### 13.3 选择并变换

1. 激活 SelectTool。
2. 点击对象选中，显示包围盒和变换 gizmo。
3. 拖拽 gizmo 轴进行移动/旋转/缩放。
4. 实时更新节点数据，systems 重新生成几何。
5. 释放鼠标后记录历史。
