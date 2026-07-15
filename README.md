<div align="center">
  <img src="build/icon.png" alt="ArchAgent" width="128" />
  <h1>ArchAgent</h1>
  <p>基于对话的桌面空间设计智能体，支持建筑/房间/室内 3D 建模、实时预览和模型导出。</p>
  <p>Hy3 作为默认模型品牌，底层通过 OpenAI-compatible Chat Completions 接入；基于 Pascal Editor 与 React Three Fiber 构建 3D 场景，结合自研编辑工具与 MCP 工具集，把空间设计收进同一个桌面工作台。</p>
  <p>
    <a href="#快速开始">快速开始</a> ·
    <a href="#产品亮点">产品亮点</a> ·
    <a href="#配置说明">配置说明</a> ·
    <a href="#可用脚本">可用脚本</a> ·
    <a href="docs/design/README.md">设计文档</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/version-0.2.1-6E56CF" alt="version" />
    <img src="https://img.shields.io/badge/Electron-39.2.7-47848F?logo=electron&amp;logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&amp;logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Hy3-Tencent%20Hunyuan-00A4EF" alt="Hy3" />
  </p>
  <p>
    <img src="https://img.shields.io/badge/Three.js-3D-111827?logo=three.js&amp;logoColor=white" alt="Three.js" />
    <img src="https://img.shields.io/badge/React%20Three%20Fiber-9-111827" alt="React Three Fiber" />
    <img src="https://img.shields.io/badge/OpenAI-compatible-111827" alt="OpenAI-compatible" />
    <img src="https://img.shields.io/badge/Windows-supported-0078D4?logo=windows&amp;logoColor=white" alt="Windows" />
    <img src="https://img.shields.io/badge/Local-first-0F766E" alt="Local-first" />
  </p>
</div>

## 产品概览

ArchAgent 是一款基于 Electron、React 19、Redux Toolkit、Radix UI、Pi Agent SDK、OpenAI-compatible SDK、Tencent Hunyuan Hy3、React Three Fiber 和 Pascal Editor 的桌面端空间设计智能体，面向自然语言驱动的建筑/房间/室内场景建模、实时 3D 预览、交互式编辑和模型导出。

模型侧默认面向 Hy3，接口通过 OpenAI-compatible Chat Completions 接入。3D 场景基于 `@pascal-app/core` 的节点数据模型和 `@pascal-app/viewer` 的渲染能力；编辑工具参考 Aedifex 的 `packages/editor` 与 `packages/mcp` 自研实现。

## 产品亮点

- 对话即设计：用自然语言描述空间需求，Agent 自动创建墙体、门窗、楼板、家具等节点。
- Blender 风格 3D 编辑器：中间主区域提供选择、移动、旋转、缩放、画墙、放门窗、放家具等工具。
- 实时预览：基于 React Three Fiber 与 Pascal Editor 实时渲染建筑场景，支持撤销重做。
- 多格式导出：支持 GLB、STL、OBJ、JSON 等格式，可用于 3D 打印、游戏引擎或进一步设计。
- 图像转 3D：可调用混元图像转 3D API，将参考照片转换为 3D 模型。
- 本地优先：场景数据、模型文件和配置默认留在本机。
- 安全桥接：Renderer 通过 preload 暴露的 `window.archAgent` 与 Main 进程通信，API Key 只在 Electron Main 侧读取。

## 典型场景

- 快速设计房间布局和户型方案。
- 根据照片或草图生成 3D 空间参考。
- 导出 STL/OBJ 用于 3D 打印原型。
- 与 Agent 反复对话调整空间尺寸和家具摆放。

## 典型流程

1. 新建或打开一个项目工作区。
2. 通过右侧对话面板描述空间需求，例如“创建一个 5m×4m 的卧室，南墙开一扇门一扇窗”。
3. Agent 调用建模工具创建或修改场景节点。
4. 中间 3D 编辑器实时预览结果，用户可直接拖拽调整。
5. 导出 GLB / STL / OBJ / JSON 产物，用于后续使用。

## 快速开始

```bash
npm install
copy .env.example .env.local
npm run dev
```

开发态启动后，渲染端通过 Electron preload 暴露的 `window.archAgent` 与 Main 进程通信。不要直接用浏览器打开渲染页，否则无法使用 IPC、文件、Agent 和 3D 能力。

## 配置说明

`.env.local` 会优先于 `.env` 加载。也可以在应用内“设置”面板保存模型与工具配置，配置会写入本地 `.env.local`。

完整示例和中文说明见 [.env.example](./.env.example)。常用配置分为三类：

- 模型接入：`HY3_API_KEY`、`HY3_BASE_URL`、`HY3_CHAT_MODEL`、`HY3_CHAT_IMAGE_INPUT_ENABLED`、`HY3_THINKING_ENABLED`
- 识图能力：`HY3_VISION_*`
- 运行控制：`AGENT_EXEC_BASH_ENABLED`

项目仍兼容部分历史 `OPENAI_*` 环境变量作为迁移兜底，但新配置应优先使用 `HY3_*`。

## 当前内置工具

- `remember_project`：记录会话中的关键设计事实。
- `time`：获取当前时间。
- `create_site` / `create_building` / `create_level`：创建场景层级。
- `create_wall` / `update_wall` / `delete_wall`：墙体操作。
- `place_door` / `update_door`：放置和修改门。
- `place_window` / `update_window`：放置和修改窗。
- `create_slab` / `create_zone` / `place_item`：楼板、房间区域、家具。
- `update_node` / `delete_node`：通用节点操作。
- `export_scene`：导出场景为 GLB / STL / OBJ / JSON。
- `image_to_3d`：调用混元图像转 3D API。
- `web_search`：按需检索公开网页信息。
- `read_file` / `read_image`：读取本地资料内容。
- `write_file` / `send_file`：写入并发送产物。
- `exec_bash`：可选命令执行工具，默认用于可信本地任务。

建模能力以场景节点、通用 Mesh 资产和可验证的场景命令为核心；详细边界见 [设计文档](docs/design/README.md)。

## 技术栈

- 桌面端：Electron、electron-vite、electron-builder
- 前端：React 19、TypeScript、Redux Toolkit、React Redux
- UI：Radix UI、lucide-react、Incremark
- 3D：Three.js、@react-three/fiber@9、@react-three/drei@10
- 建筑场景：@pascal-app/core、@pascal-app/viewer
- 参数化建模补充：JSCAD
- Agent：`@mariozechner/pi-coding-agent`
- 模型：Tencent Hunyuan Hy3，OpenAI-compatible SDK
- 测试：Vitest

## 目录结构

```text
src/
  main/
    agent/      会话编排、Pi 模型桥、工具注册与上下文压缩
    app/        Electron 窗口、Renderer 事件总线与 IPC 装配
    config/     环境变量和应用设置
    files/      附件、产物预览与受限文件访问
    projects/   项目目录、会话状态和持久化
    runtime/    随包 Python 发现与运行时诊断
    modeling3d/ Main 侧 3D 领域边界
  preload/     安全 IPC Bridge，暴露 window.archAgent
  renderer/src/
    app/        React 应用壳、工作台导航和 Redux Store
    platform/   Preload Bridge 解析与错误边界
    features/   chat、files、modeling3d、projects、settings、workspace
    shared/     Renderer 内复用的无状态组件与展示工具
    styles/     按工作台区域拆分且保持固定级联顺序的样式
  shared/      跨进程 API 类型、附件限制和应用元信息
docs/design/   ArchAgent 设计方案、接口文档和 UI 设计文档
tests/         按 Main/Renderer 源码领域镜像组织的单元测试
```

## 环境要求

- Node.js 20+ 推荐
- npm
- Windows 桌面环境用于完整打包验收
- 支持 WebGPU 的显卡和驱动（推荐），或回退到 WebGL

## 可用脚本

```bash
npm run dev           # 开发模式启动 Electron + Vite
npm run build         # 类型检查并构建 Main / Preload / Renderer
npm run pack          # 构建并生成 win-unpacked 目录
npm run dist          # 构建安装包
npm run preview       # 预览构建产物
npm test              # 运行全部 Vitest 单测
npm run test:watch    # 监听模式运行测试
npm run typecheck     # TypeScript 类型检查
npm run icon:generate # 生成应用图标
```

## 打包与资源

`electron-builder` 会把以下目录或文件作为 `extraResources` 复制到安装包资源目录：

- `build/icon.png`、`build/icon.ico`：应用图标。
- `.env`：可选默认环境配置。

开发态数据和生成文件位于项目本地 `data/`；打包态会使用 Electron `userData` 目录存储可写数据。

## 测试与验收

推荐提交前运行：

```bash
npm run typecheck
npm test
git diff --check
```

## 安全说明

- Renderer 不直接读取 API Key，密钥只由 Electron Main 进程加载。
- IPC 通过 preload bridge 暴露有限 API，Renderer 不启用 Node 集成。
- 生产态 CSP 保持严格策略；开发态仅为 Vite React Refresh 放行必要能力。
- `exec_bash` 默认启用以满足本地任务需求，建议只在可信任务中使用。
- 工具文件访问限制在允许目录和用户附件范围内，避免任意路径读取。

## 文档

- [设计文档索引](docs/design/README.md)
- [技术方案](docs/design/ArchAgent-技术方案.md)
- [编辑器设计方案](docs/design/ArchAgent-编辑器设计方案.md)
- [接口文档](docs/design/ArchAgent-接口文档.md)
- [UI 设计文档](docs/design/ArchAgent-UI设计文档.md)
