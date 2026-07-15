---
name: 'spec-writing'
version: '1.1.0'
title: 'Spec 与行为记录原则'
description: 'Spec workflow rules for TODO execution, checkpoints, done archives, and behavior contracts.'
category: 'workflow'
triggers:
  - 'spec'
  - 'todo'
  - 'checkpoint'
  - 'done'
  - 'behavior-record'
  - 'handoff'
appliesTo:
  - 'specs'
  - 'todos'
  - 'checkpoints'
  - 'behavior-records'
  - 'done-archives'
updated: '2026-06-21'
---

# Spec 与行为记录原则

## 用途

用于提醒模型写清楚 spec、TODO、checkpoint 和最终行为契约。

## 使用方式

- 当模型不确定相关原则、开始偏离约束或需要校准输出质量时，读取本文件。
- 本文件是指导性提示词，不替代当前 spec、TODO、用户要求或代码事实。
- 用户可以直接编辑本文件；工具会读取项目里的当前内容。

## 当前任务协议

- 先读本次 `spec_context`；没有上下文不得实现或改文档。
- 如果项目没有 specs/、AGENTS.md 或可执行 spec，先调用 `spec_bootstrap`：新项目生成起步 active spec，旧项目生成 AI 源码审查任务。
- selected specs 和 open TODOs 是唯一需求源，不按旧对话扩范围。
- 小而明确的临时任务用 `spec_todo`；需要设计和验收标准的功能开发用 `spec_create` 或 active spec。
- 按 open TODOs 自上而下执行；无 TODO 但有 selected specs 时，按 spec 目标、行为规则和验收标准执行。
- 每完成一个 TODO，必须勾选 `[x]`；无法完成则保留 `[ ]` 并写明阻塞。
- 先读目标、规则、验收标准和代码线索，再搜索代码。
- 源码线索只是搜索入口，不是事实来源；修改前必须自行读取相关文件确认。
- 遵守 Hard Rules、Recommended Practices 和 Business Confirmation Rules；冲突或高风险时先问用户。
- 高风险业务描述不完整时，停止实现，说明疑点并给出 2 到 3 种解释。
- 阶段完成后调用 `spec_checkpoint` 记录 TODO、文件、验证、风险和阻塞。
- `spec_done` 只能在实现完成、TODO 已更新、验证结果和最终行为契约已记录后调用。

## 行为记录要求

- 行为记录必须描述功能全过程，不只写一句结果。
- `spec_done` 的 `## 最终行为契约` 是给用户审查的完整功能全景，不是模型内部摘要。
- 最终行为契约必须覆盖所有已知情况：正常、失败、边界、权限、状态、异常、空值、默认参数和配置回退。
- 模型自己采用的默认行为也必须写清楚，例如未传参数时怎么处理、缺字段时怎么回退、未覆盖配置时使用什么默认值、未改变的旧行为是什么。
- 记录触发入口：用户、接口、命令、事件、定时任务或内部调用从哪里进入。
- 记录输入与前置状态：请求参数、配置、已有数据、权限、状态和环境条件。
- 记录执行步骤：按真实代码路径写出关键判断、调用、读写和返回过程。
- 记录输出结果：响应、页面状态、文件、日志、事件或可观察行为。
- 记录副作用：数据库、文件、网络请求、缓存、队列、外部服务或无副作用。
- 记录分支条件：正常、失败、边界、权限、状态、异常和空值分支。
- 记录默认行为：默认参数、配置来源、覆盖规则、模型选择的默认策略以及未传参数时的完整流程。
- 记录验证结果：命令、覆盖的流程分支、关联文件和已知风险。
- 禁止把猜测、常识或静态线索写成实际行为；只能记录已读代码、已跑测试或用户确认的事实。
