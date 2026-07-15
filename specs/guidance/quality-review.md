---
name: 'quality-review'
version: '1.1.0'
title: '质量审查原则'
description: 'Post-implementation review checklist for code quality, tests, architecture, UI/UX, and delivery risk.'
category: 'quality'
triggers:
  - 'review'
  - 'self-check'
  - 'verification'
  - 'before-done'
  - 'before-commit'
  - 'before-pr'
appliesTo:
  - 'code-review'
  - 'tests'
  - 'ui-review'
  - 'risk-review'
  - 'delivery'
updated: '2026-06-21'
---

# 质量审查原则

## 用途

用于提醒模型在实现后自查代码质量、测试覆盖、架构边界、UI/交互状态和交付风险。

## 使用方式

- 当模型不确定相关原则、开始偏离约束或需要校准输出质量时，读取本文件。
- 本文件是指导性提示词，不替代当前 spec、TODO、用户要求或代码事实。
- 用户可以直接编辑本文件；工具会读取项目里的当前内容。

## 使用时机

- 完成一段实现、准备 checkpoint、准备 done、提交前或 PR 前读取本文件。
- 复杂项目、跨模块改动、UI/交互改动、状态/权限/数据流变更必须做质量审查。
- 小改动也应快速扫一遍相关项，避免把低质量实现归档或提交。

## 代码质量自查

- 代码是否符合现有项目结构和命名风格，是否避免无意义抽象和过度设计。
- 模块边界是否清楚，UI、业务、数据访问和基础设施逻辑是否分离。
- 错误、空值、异常、权限、状态和依赖失败是否 fail fast 且可理解。
- 是否保持向后兼容，没有破坏已有 API、数据结构、行为契约或用户流程。
- 是否存在重复逻辑、隐藏副作用、资源泄漏、阻塞主线程或不必要复杂度。

## 测试与验证

- 是否运行了与改动风险匹配的 build、unit、smoke、lint 或手工验证。
- 正常、失败、边界、权限、状态、默认行为和回归风险是否至少有一种验证证据。
- 未运行的验证必须说明原因；禁止编造测试结果。

## UI 与交互质量

- 如果本次涉及 UI/UX，是否已读取 `ui-ux` guidance 并使用指定的 `ui-ux-pro-max` skill。
- 如果 skill 未安装，是否调用 `spec_skills_install`；无法安装时是否用 `dryRun: true` 给出命令并说明阻塞。
- 是否记录实际使用的 skill、安装或 dry-run 结果，以及 skill 输出中被采纳的关键建议。
- 是否避免在本地 quality-review guidance 中自行补充另一套 UI/UX 设计 checklist。

## 交付前审查

- checkpoint/done 是否记录真实行为、默认行为、边界处理和验证结果。
- 是否还有未确认业务规则、残留 TODO、风险、阻塞或需要用户审查的问题。
- 提交或 PR 前是否只包含相关改动，并且最终报告能让用户快速理解结果。
