<div align="center">
  <img src="build/icon.png" alt="ArchAgent" width="128" />
  <h1>ArchAgent</h1>
  <p>面向建筑与室内设计的本地桌面智能体，结合对话、可编辑 3D 场景、资源管理和构件库完成空间方案工作。</p>
  <p>
    <a href="#快速开始">快速开始</a> ·
    <a href="#核心能力">核心能力</a> ·
    <a href="#使用边界">使用边界</a> ·
    <a href="#配置">配置</a> ·
    <a href="#贡献">贡献</a>
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
    <img src="https://img.shields.io/badge/AGPL--3.0--only-00913A" alt="AGPL-3.0-only" />
  </p>
</div>

## 产品概览

ArchAgent 基于 Electron、React 和 Hy3 构建。用户可新建或打开本地项目，通过对话和 3D 编辑器共同创建、检查和调整建筑场景；场景、会话、资源与导出产物均由本机应用管理。

场景模型由 `src/shared/modeling3d` 的自定义契约和 reducer 定义。Main 进程负责执行场景命令、维护撤销重做、管理项目持久化和受限文件访问；Renderer 使用 Three.js、React Three Fiber、React Three Drei 及自研场景图层渲染建筑元素与导入资产。

## 核心能力

- 项目与会话：创建或打开项目目录，保存项目会话、场景快照和最近项目记录。
- 对话式建模：Agent 可基于当前会话资源和场景状态创建、更新或删除建筑元素，并返回可追踪的工具结果。
- 可编辑 3D 场景：支持场地、建筑、楼层、墙、门、窗、楼板、天花、柱、房间分区、楼梯、围栏和导入资产；提供选择、画墙、属性检查、拖拽移动、撤销重做及自由、顶、正、右等视图。
- 场景导入导出：支持可编辑的 `scene-json`，以及 `GLB`、`GLTF`、`OBJ`、`STL` 交换格式。
- 全局构件库：将模型纳入当前应用的本机构件库，按名称、类别、标签和描述检索、预览、编辑元数据并实例化到不同项目的场景中。
- 资源与文件工作区：导入文件或剪贴板附件，浏览项目目录，创建、重命名、编辑、删除和打开工作区文件；会话资源、产物历史和常见文档、图像、3D 文件支持预览。
- 参考重建流程：从复杂图片提取单件物体参考图，生成二维设计预览，创建带假设和必答项的重建计划，并在用户确认后生成和摆放资产。
- 场景核验：Agent 可读取场景快照、预览资产落点与几何关系，并获取不同视角的 WebGL 场景预览用于检查摆放。
- 运行设置：在应用内配置 Hy3 模型、图像与 3D 服务、外观、输出和高级执行项；支持恢复默认配置与运行时自检。

## 使用边界

- 3D 资产生成面向边界完整、可独立摆放的单个资产，例如家具、陈设或设备；建筑元素应通过场景工具创建。
- 设计预览用于确认布局和风格，不代表精确尺寸，也不会自动授权后续 3D 生成。
- 复杂照片会先拆分为单件资源和待确认的重建计划；确认前不会执行计划中的资产生成或摆放。
- 资产库是当前应用、本机用户范围内的共享库；摆放到场景后的实例仍属于各自项目。
- `exec_bash` 默认关闭。开启后仅用于可信任务，且需要明确用途和预期产物。

## 快速开始

在 Windows PowerShell 中执行：

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

应用以 Electron 运行。不要直接在浏览器中打开 Renderer 页面，否则无法使用 preload IPC、项目文件、会话资源和场景能力。

## 配置

`.env.local` 优先于 `.env` 加载；也可以通过应用内“运行设置”保存配置。复制 [`.env.example`](.env.example) 后至少填写 `HY3_API_KEY`。

- 对话模型：`HY3_API_KEY`、`HY3_BASE_URL`、`HY3_CHAT_MODEL`、`HY3_THINKING_ENABLED`、`HY3_REASONING_EFFORT`、`HY3_REQUEST_TIMEOUT_S`、`HY3_CONTEXT_WINDOW_TOKENS`、`HY3_MAX_OUTPUT_TOKENS`。
- 图像服务：`HY3_IMAGE_ENDPOINT`、`HY3_IMAGE_MODEL`、`HY3_IMAGE_REQUEST_TIMEOUT_S`，用于设计预览与参考物体提取。
- 3D 服务：`HY3_3D_SUBMIT_ENDPOINT`、`HY3_3D_QUERY_ENDPOINT`、`HY3_3D_MODEL`、`HY3_3D_FACE_COUNT` 及超时、轮询配置，用于单件 3D 资产生成。
- 高级执行与输出：`AGENT_EXEC_BASH_ENABLED`、`AGENT_SCRIPT_TIMEOUT_S`、`AGENT_AUTO_PDF_EXPORT`、`LIBREOFFICE_PATH`。

`HY3_*` 是推荐配置名；程序对部分 `OPENAI_*` 历史变量保留兼容读取。

## Agent 工具

Agent 使用受限的应用内工具，而非直接获得任意本机路径访问权限：

- 资源与交付：`search_resources`、`view_resources`、`send_file`。
- 构件库与资产：`search_library_assets`、`generate_3d_asset`、`place_library_asset`、`place_library_assets`、`preview_library_asset_placement`。
- 场景：`inspect_scene`、`view_scene_preview`、`update_scene_object`，以及单个或批量的建筑元素创建、更新和删除工具。
- 重建：`extract_reference_object`、`create_reconstruction_plan`、`generate_design_preview`。
- 扩展：仅在启用高级开关后提供 `exec_bash`。

## 架构

```text
Renderer
  React 工作台、文件编辑器、资源面板、对话面板和 R3F 3D 视图
       |
       |  window.archAgent（preload 暴露的受限 IPC）
       v
Electron Main
  项目与会话、Agent 编排、场景命令、构件库、文件与资源服务、设置和导出
       |
       v
本地数据
  项目目录、应用 data/、会话资源、场景快照、构件库和导出产物
```

Renderer 不启用 Node 集成，不直接读取 API Key 或任意文件路径。场景更新经 Main 进程验证后广播给 Renderer；每个项目拥有自己的场景快照与历史记录。

## 技术栈

- 桌面与构建：Electron、electron-vite、electron-builder
- 前端：React 19、TypeScript、Redux Toolkit、React Redux
- UI 与编辑：Radix UI、lucide-react、Monaco Editor、Incremark、Mermaid
- 3D：Three.js、React Three Fiber、React Three Drei
- 场景与几何：自研场景契约/reducer、JSCAD、replicad
- Agent 与模型：`@mariozechner/pi-coding-agent`、OpenAI-compatible SDK、Tencent Hunyuan Hy3
- 文件处理：Mammoth、pdf-parse、Sharp
- 测试：Vitest

## 目录结构

```text
src/
  main/
    agent/        Agent 编排、工具注册、上下文和重建流程
    app/          Electron 窗口、IPC 注册和安全响应头
    config/       环境变量与应用设置
    files/        附件、产物预览和受限文件操作
    modeling3d/   场景服务、导入导出、构件库与 3D 服务
    projects/     项目、会话和持久化
    resources/    会话资源注册与检索
    runtime/      随包运行时发现与诊断
  preload/        window.archAgent 的受限 IPC bridge
  renderer/src/   React 工作台、对话、文件、设置和 3D 编辑器
  shared/         跨进程类型、场景契约与 reducer
docs/design/      设计、接口和 UI 文档
tests/            Main、Renderer 与共享逻辑的测试
```

## 可用脚本

```bash
npm run dev           # 开发模式启动 Electron + Vite
npm run build         # 类型检查并构建 Main / Preload / Renderer
npm run pack          # 构建并生成 win-unpacked 目录
npm run dist          # 构建 NSIS 与 ZIP 安装产物
npm run preview       # 预览构建产物
npm test              # 运行全部 Vitest 测试
npm run test:watch    # 监听模式运行测试
npm run typecheck     # TypeScript 类型检查
npm run icon:generate # 生成应用图标
```

## 数据与安全

- 开发态数据存放在项目根目录的 `data/`；打包后可写数据存放在 Electron `userData` 目录。
- API Key 仅在 Main 进程加载；preload 只向 Renderer 暴露明确列出的 IPC API。
- 文件与资源服务限制在项目、应用数据和用户授权的附件范围内。
- `exec_bash` 默认关闭；打开前请评估外部命令、文件与网络访问风险。

## 验证

```bash
npm run typecheck
npm test
git diff --check
```

## 贡献

贡献流程、代码约定、验证和提交规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。PR 请使用 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md)。

## 许可证

本项目采用 [GNU Affero General Public License v3.0 only](LICENSE)（`AGPL-3.0-only`）许可。

## 文档

- [设计文档索引](docs/design/README.md)
- [技术方案](docs/design/ArchAgent-技术方案.md)
- [编辑器设计方案](docs/design/ArchAgent-编辑器设计方案.md)
- [接口文档](docs/design/ArchAgent-接口文档.md)
- [UI 设计文档](docs/design/ArchAgent-UI设计文档.md)
