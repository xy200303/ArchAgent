---
name: 'git-commit'
version: '1.1.0'
title: 'Git 提交工作流原则'
description: 'Safe commit workflow for verification, staging relevant files, commit messages, and final reports.'
category: 'git'
triggers:
  - 'commit'
  - 'git'
  - 'stage'
  - 'verify-before-commit'
appliesTo:
  - 'git-status'
  - 'staging'
  - 'commit-message'
  - 'verification-report'
updated: '2026-06-21'
---

# Git 提交工作流原则

## 用途

用于提醒模型在用户要求提交代码时安全地验证、暂存、提交并汇报结果。

## 使用方式

- 当模型不确定相关原则、开始偏离约束或需要校准输出质量时，读取本文件。
- 本文件是指导性提示词，不替代当前 spec、TODO、用户要求或代码事实。
- 用户可以直接编辑本文件；工具会读取项目里的当前内容。

## 触发条件

- 只有用户明确要求提交、帮我提交、commit、自动提交或等价表达时才使用本指导。
- 不要因为完成了代码修改就自行提交；提交必须是用户意图或当前任务明确要求。
- 提交前先完成用户要求的代码或文档工作，并确认没有未处理的阻塞。

## 工作流

1. 运行与本次变更风险匹配的验证；优先跑触达区域的测试，实际可行时同时跑 `git diff --check`。
2. 查看 `git status --short` 和 `git diff --name-status`，确认工作区里哪些文件属于本次任务。
3. 只暂存本次任务相关文件；无关脏文件保持未暂存，并在最终报告里说明。
4. 如果用户要求继续提交剩余工作，可以提交所有确认属于当前任务的剩余变更，但跳过没有真实内容差异的文件。
5. 提交信息语言遵循用户最新明确要求；没有指定时默认中文。用户给了精确提交信息时原样使用。
6. 使用简洁、动作导向、具体的提交信息，避免 `更新代码` 这类空泛描述。
7. 提交后报告短 hash、提交信息、验证命令与结果，以及工作区是否干净。

## 安全规则

- 禁止使用 `git reset --hard`、`git checkout --` 等破坏性命令准备提交，除非用户明确要求。
- 不要把无关用户改动混进提交；如果相关性不清楚，先问一个简短问题。
- 暂存未跟踪文件前必须看文件名和用途，跳过缓存、密钥、日志、构建产物和临时文件。
- 如果文件里疑似包含 secret，不要在回复中引用；提交风险不清楚时先停止并询问。
- 优先使用非交互式 git 命令，避免进入交互控制台。
- 重要命令输出要在最终回复中总结，因为用户不一定能看到工具输出。

## 暂存模式

```powershell
git add -- "path/to/file" "path/to/other-file"
```

删除已跟踪文件且属于本次任务时：

```powershell
git add -- "path/to/deleted-file"
```

提交前检查暂存快照：

```powershell
git diff --cached --name-status
git diff --cached --check
```

## 提交信息

- 默认中文提交信息使用“动作 + 主要对象”的短句，例如 `完善 guidance 提交工作流`。
- 英文提交信息也保持短、具体、动作导向，例如 `Add guidance commit workflow`。
- 不要把多个不相关主题塞进同一个提交信息。

## 最终报告

- 说明提交已完成。
- 给出短 hash 和提交信息。
- 列出实际通过的验证。
- 只有存在剩余未暂存变更时才说明。
