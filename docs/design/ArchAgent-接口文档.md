# ArchAgent 三维接口约定

## 权威入口

Renderer、人工工具和 Agent 都不能跨进程直接修改项目文件或 Three 对象。所有场景变更通过 Main 进程的 `SceneService`：

```text
scene.getSnapshot()       -> SceneSnapshot
scene.execute(command)    -> SceneCommandResult
scene.undo()/redo()       -> SceneHistoryResult
scene.import()/export()   -> 项目文件与 SceneSnapshot
```

成功命令广播 `scene.command.applied`，项目切换、撤销和重做广播 `scene.snapshot.restored`。R3F Viewer 收到新快照后重新投影几何；失败命令不改变快照。

## 命令边界

当前命令覆盖墙、楼板、天花、柱、分区、楼梯、围栏、门、窗与外部资产的创建、更新或删除。门窗以墙体 ID 为前置条件；外部资产只有名称、格式、位置、旋转与缩放的语义，不能被当作参数化建筑构件。

Agent 必须先读取需要的节点 ID，再调用同一条命令链路，并在响应中报告受影响节点和 snapshot revision。

## 文件边界

- 场景：`.agent/scene.json`
- 资产：`.agent/assets/`
- 可导入：GLB、GLTF、OBJ、STL
- 可导出：GLB、GLTF、OBJ、STL 与场景 JSON

GLTF 仅保证内嵌资源或自包含 GLB；带外部 `.bin`、贴图依赖的模型应预先打包。IPC 只传受控路径或 Base64 载荷，避免泄露任意绝对路径。
