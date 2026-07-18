# ArchAgent 技术方案

详细编辑器边界见 [ArchAgent-编辑器设计方案.md](./ArchAgent-编辑器设计方案.md)。

## 技术栈

| 层级 | 方案 | 职责 |
| --- | --- | --- |
| 桌面容器 | Electron + electron-vite | 主进程、预加载桥与窗口生命周期 |
| 编辑渲染 | Three.js + React Three Fiber | 单一 WebGL 视图、建筑几何、资产预览与选择 |
| 相机 | Drei `CameraControls` + 自研导航球 | 平移、缩放、预设与导航球旋转 |
| 场景领域 | `SceneSnapshot` + `SceneCommand` | 可验证节点、历史与项目持久化 |
| 三维交换 | Three exporters/loaders + Main 服务 | GLB/GLTF/OBJ/STL 导入导出与受控文件路径 |
| 智能体 | Agent 工具 + 混元 3D 服务 | 场景命令、资产生成、导入与布局 |

## 运行时原则

1. `SceneService` 是唯一权威状态；R3F 只消费快照。
2. 主线不依赖 WebGPU，也不维护第二套 Pascal 或兼容渲染器。
3. 网格、导航球、选择描边等编辑辅助物不参与模型导出。
4. 外部模型文件进入项目受控资产目录；Renderer 不接收任意本机路径。
5. 性能优化优先采用按需加载、预览图缓存、几何复用、实例化和 LOD，而不是额外 Canvas。

## 演进方向

先完善参数化建筑构件、贴图材质、变换与捕捉，再扩展图生 3D 的资产管线和跨行业模型语义。
