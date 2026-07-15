---
name: 'pr-submit'
version: '1.1.0'
title: 'PR 提交工作流原则'
description: 'Pull request workflow for template discovery, commits, branch push, PR body, and fallback URLs.'
category: 'pull-request'
triggers:
  - 'pr'
  - 'pull-request'
  - 'merge-request'
  - 'branch-push'
  - 'gh-pr-create'
appliesTo:
  - 'pull-requests'
  - 'branches'
  - 'pr-template'
  - 'review-notes'
updated: '2026-06-21'
---

# PR 提交工作流原则

## 用途

用于提醒模型在用户要求准备、创建或提交 PR 时安全地发现模板、提交变更、推送分支并生成 PR 内容。

## 使用方式

- 当模型不确定相关原则、开始偏离约束或需要校准输出质量时，读取本文件。
- 本文件是指导性提示词，不替代当前 spec、TODO、用户要求或代码事实。
- 用户可以直接编辑本文件；工具会读取项目里的当前内容。

## 触发条件

- 只有用户明确要求准备 PR、生成 PR、创建 Pull Request、提交 PR 或等价表达时才使用本指导。
- 不要在没有用户授权时提交、amend、reset、rebase、force-push 或创建 PR。

## 工作流

1. 检查仓库状态：运行 `git status --short --branch`，识别当前分支、上游、remote URL 和可能的 base branch。
2. 写 PR 正文或补交 commit 前，先查找项目 PR 模板。
3. 同步决定 PR 语言和 commit 语言：用户指定优先；模板语言明显时跟随模板；否则默认英文。
4. 如果当前 PR 工作还没提交，先按 Git 提交工作流安全提交；只提交属于该 PR 的变更。
5. 检查分支是否已推送：没有 upstream 时用 `git push -u origin <branch>`；已有 upstream 且本地 ahead 时用 `git push`。
6. 按发现的模板生成 PR 标题和正文；没有模板时使用默认英文格式。
7. 工具可用时优先用 `gh pr create --title ... --body-file ...` 创建 PR，避免 shell 引号问题。
8. 如果 `gh` 缺失或未认证，推送分支后提供 GitHub compare URL、标题和正文，供用户手动创建。

## PR 模板发现顺序

1. `.github/pull_request_template.md`
2. `.github/PULL_REQUEST_TEMPLATE.md`
3. `.github/PULL_REQUEST_TEMPLATE/*.md`
4. `PULL_REQUEST_TEMPLATE.md`
5. `pull_request_template.md`
6. `docs/pull_request_template.md`
7. `docs/PULL_REQUEST_TEMPLATE.md`

可用搜索命令：

```powershell
rg --files | rg -i '(^|[\\/])(\.github[\\/])?(pull_request_template|PULL_REQUEST_TEMPLATE)([\\/].*\.md|\.md)$'
```

- 如果找到多个模板，选与任务或分支最匹配的；没有明确选择时按上面的顺序取第一个确定路径并说明。
- 保留模板标题、必需 checkbox 和必需措辞；占位符要替换成具体内容。

## 默认 PR 格式

没有项目模板时使用：

```md
## Summary
-

## Verification
-

## Notes
-
```

- 默认英文，除非用户明确要求其他语言。
- 标题要简洁、动作导向。
- 只写实际运行过的验证；不要编造测试结果。
- 没有 caveat、后续事项或手动步骤时省略 `Notes`。

## Base Branch 与 Compare URL

- base branch 推断顺序：用户指定、remote 默认分支、`main`、`master`。
- GitHub remote 且不能创建 PR 时，提供 `https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1`。
- 非 GitHub remote 时，提供已推送分支、base branch、标题、正文，并说明需要在对应代码托管平台创建。

## 安全规则

- 不要在 PR 正文中包含 `.env`、日志、配置或命令输出里的 secret。
- 工作区脏时，只提交属于当前 PR 的改动；无关文件保持未暂存并说明。
- commit message 语言和 PR 语言保持一致。
- 如果当前分支已有 open PR，能检测到时更新或报告已有 PR，不创建重复 PR。
- 不要使用 `--force` 或 `--force-with-lease`，除非用户明确要求。
- base branch 或 remote 无法安全推断时，先问一个简短问题。

## 最终报告

- 说明 PR 已创建还是仅准备好。
- 给出 PR URL 或 compare URL。
- 给出 PR 标题。
- 如果本流程创建了 commit，给出 commit hash。
- 说明使用的模板来源，或说明使用默认英文格式。
- 列出实际运行的验证和剩余阻塞。
