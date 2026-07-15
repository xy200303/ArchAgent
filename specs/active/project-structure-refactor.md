# 项目结构重构

## 用户原始要求

> 注意代码需要做到人类和ai可读，关键函数需要增加注释，要合理拆分文件，合理组织边界，不要一个文件堆砌大量代码，不要一个目录堆砌文件，需要合理组织目录结构。
>
> 现在先把整个现有项目组织下再开始新的开发。
>
> 可以参考 specs/guidance 里面的设计原则。

## 目标结果

- Main、Renderer、Shared 和测试按业务能力组织，不在根目录平铺领域文件。
- 入口文件只负责依赖装配与启动，不承载大段业务逻辑。
- UI、业务规则、数据访问和基础设施逻辑分别落在可识别的模块边界。
- 新建或重写文件包含简短顶部职责注释；关键边界说明设计原因。
- 本次只做等价重构，不改变现有用户行为、IPC 契约或持久化格式。

## 目标结构

```text
src/main/
  agent/       Agent runtime、模型桥、工具与上下文
  app/         Electron 启动、窗口、IPC 装配
  config/      环境变量与设置
  files/       附件、产物与工作区文件
  projects/    项目与会话持久化
  runtime/     运行时发现与诊断
  modeling3d/  3D 领域能力

src/renderer/src/
  app/         React 入口、应用壳和 Redux
  platform/    Preload bridge、错误边界
  features/    chat、workspace、settings、modeling3d、files
  shared/      Renderer 内跨 feature 复用组件和工具

src/shared/    Main、Preload 与 Renderer 共享的 IPC 契约和应用元数据
```

## 执行清单

- [x] 撤回未完成的场景命令接入，恢复可构建基线。
- [x] 审计文件大小、职责和依赖关系。
- [x] 按领域迁移独立 Main 与 Renderer 模块。
- [x] 拆分 Main `index.ts`、Renderer `App.tsx` 和大体积样式文件。
- [x] 拆分 Agent bridge 与 tool registry 中的独立纯逻辑。
- [x] 让测试目录镜像源码领域，并修正导入。
- [x] 更新项目结构文档。
- [x] 运行残留扫描、类型检查、测试、构建和 diff 检查。

## 验证器

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `git diff --check`
5. 结构扫描：除生成文件外，不再出现单个超过 800 行的 TypeScript/TSX 文件；入口文件目标不超过 300 行。

## 风险控制

- 保留现有 API、事件名、存储文件和行为契约。
- 每完成一个领域迁移立即运行类型检查，避免一次性堆积导入错误。
- 工作区已有用户改动全部保留，不使用 reset、checkout 或覆盖式回滚。

## 完成记录

- Main 入口缩减到 300 行以内；窗口、IPC、设置、项目、持久化、文件、附件和会话编排均由显式服务装配。
- Renderer 应用壳按项目、工作区、文件、聊天、设置和 3D 领域拆分；样式按原级联顺序拆为七个职责文件。
- Pi JSON Schema 转换与 Web 搜索适配从大文件提取为可独立测试的纯模块。
- `src/shared/types.ts` 保持为单一跨进程契约文件：当前规模低于阈值，继续拆分只会增加 Main/Preload/Renderer 的契约导入分散度。
- 已使用 `ui-ux-pro-max` 检查样式重构边界；本次保持选择器、数值、动画、媒体查询和视觉行为不变。
- 验证：`npm run typecheck` 通过；`npm test` 通过（21 files / 83 tests）；`npm run build` 通过；源码 TS/TSX 均不超过 800 行，Main 入口 231 行。
