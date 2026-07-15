---
name: 'ui-ux'
version: '1.1.0'
title: 'UI/UX Skill 路由原则'
description: 'UI/UX routing guidance that tells models to use the designated ui-ux-pro-max skill instead of maintaining local design rules.'
category: 'ui-ux'
triggers:
  - 'ui'
  - 'ux'
  - 'website'
  - 'component'
  - 'interaction'
  - 'copywriting'
  - 'visual-design'
appliesTo:
  - 'frontend'
  - 'website'
  - 'components'
  - 'layout'
  - 'copy'
  - 'interaction'
  - 'responsive-design'
updated: '2026-06-21'
---

# UI/UX Skill 路由原则

## 用途

用于提醒模型在 UI/UX 任务中使用指定外部 skill，而不是在本 guidance 内展开设计原则。

## 使用方式

- 当模型不确定相关原则、开始偏离约束或需要校准输出质量时，读取本文件。
- 本文件是指导性提示词，不替代当前 spec、TODO、用户要求或代码事实。
- UI/UX 任务默认优先使用 `ui-ux-pro-max` skill：先用 `spec_skills_install` 确保 `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` 中的 `ui-ux-pro-max` 已安装到当前编程工具的全局 skills 目录；需要其他专项能力时先用 `spec_skills_search` 搜索 skills.sh。
- 本 guidance 只负责路由到指定 skill，不再维护本地 UI/UX 设计原则或 checklist。
- 用户可以直接编辑本文件；工具会读取项目里的当前内容。

## 指定 Skill

- UI/UX 设计、实现、评审、修复和优化任务默认使用 `ui-ux-pro-max` skill。
- 默认来源：`https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`。
- 默认安装：先调用 `spec_skills_install`；不传参数时会通过 `npx skills add` 将 `ui-ux-pro-max` 安装到 Codex 全局 skills 目录。
- 需要确认命令但不写入全局目录时，调用 `spec_skills_install` 并传 `dryRun: true`。
- 需要查找其他 UI/UX 专项能力时，先调用 `spec_skills_search` 搜索 skills.sh，再按用户或任务需要安装。

## 模型行为

- 本文件只负责把 UI/UX 工作路由到指定 skill；不要在本文件内继续维护视觉、文案、首屏、官网结构或验收 checklist。
- 模型不要基于本 guidance 自行设计 UI/UX 规则；读取并使用 `ui-ux-pro-max` skill 的说明来完成设计判断。
- 如果 `ui-ux-pro-max` skill 与当前用户要求或当前 spec 冲突，以用户要求和当前 spec 为准，并在 checkpoint 或最终回复中说明取舍。
- 如果 skill 未安装且当前环境不能安装，明确报告阻塞或使用 `dryRun` 给出安装命令，不要伪造已使用 skill。
