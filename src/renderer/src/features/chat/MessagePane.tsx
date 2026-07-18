/** Chat transcript rendering, process grouping, tool details, and artifact actions. */
import { memo, useEffect, useMemo, useRef, useState, type JSX } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { IncremarkContent } from "@incremark/react";
import {
  Bot,
  BrickWall,
  CheckCircle2,
  CircleAlert,
  ChevronDown,
  Database,
  Eye,
  File,
  FolderOpen,
  Image,
  Loader2,
  Menu,
  MoreHorizontal,
  User,
  XCircle
} from "lucide-react";
import type { ArchAgentApi, ChatSession, ReconstructionWorkflow, StreamItem } from "../../../../shared/types";
import { getErrorMessage } from "../../platform/bridge";
import {
  groupStreamItemsForDisplay,
  type ProcessStreamItem
} from "./streamOrdering";
import { formatToolPreview, isImageKind } from "../../shared/presentation";

export const MessagePane = memo(function MessagePane({
  api,
  session,
  onPreviewArtifact,
  onError
}: {
  api: ArchAgentApi;
  session?: ChatSession;
  onPreviewArtifact: (artifactId: string) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayBlocks = useMemo(() => (session ? groupStreamItemsForDisplay(session.items) : []), [session?.items]);
  const shouldShowPendingThinking = Boolean(
    session?.status === "running" && !session.items.some(isUnfinishedAssistantMessage)
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: session?.status === "running" ? "auto" : "smooth"
    });
  }, [session?.items.length, session?.items.at(-1), session?.status]);

  return (
    <ScrollArea.Root className="message-scroll">
      <ScrollArea.Viewport ref={scrollRef} className="message-pane">
        {!session || session.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-hero-icon">
              <Database size={28} />
            </div>
            <strong>准备开始一次空间设计</strong>
            <span>描述你想要的房间或建筑场景，上传参考图片，Agent 会帮你在 3D 工作台中建模、预览并导出模型。</span>
            <div className="empty-capabilities" aria-label="分析能力">
              <span>
                <BrickWall size={14} />
                建筑墙体
              </span>
              <span>
                <Eye size={14} />
                三维预览
              </span>
              <span>
                <Image size={14} />
                参考图识别
              </span>
            </div>
          </div>
        ) : (
          <>
            {displayBlocks.map((block) => (
              block.kind === "message" ? (
                <StreamRow
                  key={block.id}
                  api={api}
                  item={block.item}
                  onPreviewArtifact={onPreviewArtifact}
                  onError={onError}
                />
              ) : (
                <ProcessCard
                  key={block.id}
                  api={api}
                  items={block.items}
                  onPreviewArtifact={onPreviewArtifact}
                  onError={onError}
                />
              )
            ))}
            {session.workflow ? <ReconstructionWorkflowCard api={api} sessionId={session.id} workflow={session.workflow} onError={onError} /> : null}
            {shouldShowPendingThinking ? <PendingAssistantRow /> : null}
          </>
        )}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
        <ScrollArea.Thumb className="scrollbar-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
});

function ReconstructionWorkflowCard({
  api,
  sessionId,
  workflow,
  onError
}: {
  api: ArchAgentApi;
  sessionId: string;
  workflow: ReconstructionWorkflow;
  onError: (message: string) => void;
}): JSX.Element {
  const [pendingAction, setPendingAction] = useState<string>();
  const statusLabel = {
    needs_clarification: "等待你的选择",
    ready_for_confirmation: "等待生成确认",
    generating: "正在生成并摆放",
    completed: "已完成",
    needs_attention: "需要处理失败项",
    cancelled: "已取消"
  }[workflow.status];

  async function answer(questionId: string, optionId: string): Promise<void> {
    setPendingAction(`${questionId}:${optionId}`);
    try {
      await api.workflow.answer({
        sessionId,
        workflowId: workflow.id,
        revision: workflow.revision,
        questionId,
        optionId
      });
    } catch (error) {
      onError(`保存选择失败：${getErrorMessage(error)}`);
    } finally {
      setPendingAction(undefined);
    }
  }

  async function confirm(): Promise<void> {
    setPendingAction("confirm");
    try {
      await api.workflow.confirm({ sessionId, workflowId: workflow.id, revision: workflow.revision });
    } catch (error) {
      onError(`确认生成失败：${getErrorMessage(error)}`);
    } finally {
      setPendingAction(undefined);
    }
  }

  async function retry(assetId: string): Promise<void> {
    setPendingAction(`retry:${assetId}`);
    try {
      await api.workflow.retry({ sessionId, workflowId: workflow.id, revision: workflow.revision, assetId });
    } catch (error) {
      onError(`重试资产失败：${getErrorMessage(error)}`);
    } finally {
      setPendingAction(undefined);
    }
  }

  return (
    <section className={`reconstruction-workflow-card ${workflow.status}`}>
      <header>
        <div>
          <span className="workflow-kicker">3D 重建计划 · v{workflow.revision}</span>
          <strong>{workflow.title}</strong>
        </div>
        <span className="workflow-status">{statusLabel}</span>
      </header>
      <p>{workflow.summary}</p>
      {workflow.assumptions.length ? <small>假设：{workflow.assumptions.join("；")}</small> : null}
      {workflow.questions.map((question) => (
        <section className="workflow-question" key={question.id}>
          <strong>{question.prompt}{question.required ? " *" : ""}</strong>
          <div className="workflow-options">
            {question.options.map((option) => {
              const selected = question.selectedOptionId === option.id;
              const action = `${question.id}:${option.id}`;
              return (
                <button
                  type="button"
                  key={option.id}
                  className={selected ? "selected" : ""}
                  disabled={workflow.status !== "needs_clarification" || Boolean(pendingAction)}
                  onClick={() => void answer(question.id, option.id)}
                >
                  <span>{option.label}</span>
                  {option.description ? <small>{option.description}</small> : null}
                  {pendingAction === action ? <Loader2 size={13} className="spin" /> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <section className="workflow-assets">
        <strong>资产执行清单</strong>
        {workflow.assets.map((asset) => (
          <div className="workflow-asset-row" key={asset.id}>
            <span>{asset.name} × {asset.quantity} · {describeWorkflowAsset(asset)}</span>
            {asset.status === "failed" ? <button type="button" disabled={Boolean(pendingAction)} onClick={() => void retry(asset.id)}>{pendingAction === `retry:${asset.id}` ? "重试中…" : "重试"}</button> : null}
          </div>
        ))}
      </section>
      {workflow.status === "ready_for_confirmation" ? (
        <footer>
          <span>确认后按当前版本并行处理；缺失资产默认使用最低低模配置。</span>
          <button type="button" className="workflow-confirm" disabled={pendingAction === "confirm"} onClick={() => void confirm()}>
            {pendingAction === "confirm" ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
            按当前方案生成
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function describeWorkflowAsset(asset: ReconstructionWorkflow["assets"][number]): string {
  if (asset.status === "failed") return `失败：${asset.error || "请重试"}`;
  if (asset.status === "placed") return "已放置";
  if (asset.status === "running") return asset.source === "library" ? "正在放置" : "正在生成";
  if (asset.status === "queued") return "等待执行";
  return asset.source === "library" ? "复用构件库" : asset.source === "image" ? "图生低模" : "文生低模";
}

function isUnfinishedAssistantMessage(item: StreamItem): boolean {
  return item.kind === "message" && item.role === "assistant" && !item.isFinished;
}

function PendingAssistantRow(): JSX.Element {
  return (
    <article className="message-row assistant thinking-row">
      <div className="avatar">
        <Bot size={15} />
      </div>
      <div className="message-body">
        <ThinkingIndicator />
      </div>
    </article>
  );
}

interface ProcessCardProps {
  api: ArchAgentApi;
  items: ProcessStreamItem[];
  onPreviewArtifact: (artifactId: string) => void;
  onError: (message: string) => void;
}

const ProcessCard = memo(function ProcessCard({
  api,
  items,
  onPreviewArtifact,
  onError
}: ProcessCardProps): JSX.Element {
  const status = resolveProcessCardStatus(items);

  return (
    <Collapsible.Root className={`process-card ${status}`} defaultOpen>
      <div className="process-card-toolbar">
        <ProcessCardStatusIcon status={status} />
        <div className="process-card-heading">
          <span className="process-card-title">执行过程</span>
          <span className="process-card-count">{formatProcessCardCounts(items)}</span>
        </div>
        <Collapsible.Trigger asChild>
          <button type="button" className="process-card-toggle" aria-label="展开或折叠执行过程" title="展开或折叠执行过程">
            <ChevronDown size={14} />
          </button>
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content className="process-card-body">
        {items.map((processItem) => (
          <StreamRow
            key={processItem.id}
            api={api}
            item={processItem}
            onPreviewArtifact={onPreviewArtifact}
            onError={onError}
            embedded
          />
        ))}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}, areProcessCardPropsEqual);

function areProcessCardPropsEqual(previous: ProcessCardProps, next: ProcessCardProps): boolean {
  if (
    previous.api !== next.api ||
    previous.onPreviewArtifact !== next.onPreviewArtifact ||
    previous.onError !== next.onError ||
    previous.items.length !== next.items.length
  ) {
    return false;
  }
  return previous.items.every((item, index) => item === next.items[index]);
}

function ProcessCardStatusIcon({ status }: { status: "running" | "success" | "failed" }): JSX.Element {
  if (status === "running") return <Loader2 size={14} className="spin" />;
  if (status === "failed") return <XCircle size={14} />;
  return <CheckCircle2 size={14} />;
}

function resolveProcessCardStatus(items: ProcessStreamItem[]): "running" | "success" | "failed" {
  if (items.some((item) => item.kind === "tool" && item.status === "failed")) return "failed";
  if (items.some((item) => item.kind === "tool" && item.status === "running")) return "running";
  return "success";
}

function formatProcessCardCounts(items: ProcessStreamItem[]): string {
  const toolCount = items.filter((item) => item.kind === "tool").length;
  const fileCount = items.filter((item) => item.kind === "file").length;
  const stageCount = items.filter((item) => item.kind === "stage").length;
  const messageCount = items.filter((item) => item.kind === "message").length;
  return [
    toolCount ? `${toolCount} 个工具` : "",
    messageCount ? `${messageCount} 条说明` : "",
    stageCount ? `${stageCount} 条过程` : "",
    fileCount ? `${fileCount} 个文件` : ""
  ].filter(Boolean).join(" · ");
}

const StreamRow = memo(function StreamRow({
  api,
  item,
  onPreviewArtifact,
  onError,
  embedded = false
}: {
  api: ArchAgentApi;
  item: StreamItem;
  onPreviewArtifact: (artifactId: string) => void;
  onError: (message: string) => void;
  embedded?: boolean;
}): JSX.Element {
  if (item.kind === "message") {
    if (embedded && item.role === "assistant") {
      return (
        <div className="process-message-row">
          <Bot size={14} />
          <div className="process-message-body">
            {item.content.trim() ? (
              <IncremarkContent content={item.content} isFinished={item.isFinished} />
            ) : item.isFinished ? null : (
              <ThinkingIndicator />
            )}
          </div>
        </div>
      );
    }

    const isUser = item.role === "user";
    const failure = item.role === "assistant" && item.isFinished ? describeAgentFailure(item.content) : undefined;
    return (
      <article className={`message-row ${item.role}`}>
        {!isUser ? <div className="avatar"><Bot size={15} /></div> : null}
        <div className="message-body">
          {item.role === "assistant" ? (
            failure ? (
              <AgentFailureCard failure={failure} />
            ) : item.content.trim() ? (
              <IncremarkContent content={item.content} isFinished={item.isFinished} />
            ) : item.isFinished ? (
              null
            ) : (
              <ThinkingIndicator />
            )
          ) : (
            <p>{item.content}</p>
          )}
        </div>
        {isUser ? <div className="avatar"><User size={15} /></div> : null}
      </article>
    );
  }

  if (item.kind === "tool") {
    return <ToolRow item={item} embedded={embedded} />;
  }

  if (item.kind === "file") {
    return (
      <div className={embedded ? "file-row embedded" : "file-row"}>
        {isImageKind(item.fileKind) ? <Image size={16} /> : <File size={16} />}
        <span>{item.name}</span>
        <span className="file-kind">{item.fileKind}</span>
        <ArtifactActions
          api={api}
          artifactId={item.artifactId}
          onPreview={() => onPreviewArtifact(item.artifactId)}
          onError={onError}
        />
      </div>
    );
  }

  return (
    <div className={embedded ? "stage-row embedded" : "stage-row"}>
      <span>{item.title}</span>
      {item.detail ? <small>{item.detail}</small> : null}
    </div>
  );
});

function describeAgentFailure(content: string): { summary: string; details: string } | undefined {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!/生成中断|模型返回错误|\b(?:4\d\d|5\d\d)\b|does not exist|access to it/i.test(normalized)) return undefined;

  const model = normalized.match(/(?:the\s+model|模型)\s*[“"']?([\w.-]+)/i)?.[1];
  const summary = model && /does not exist|access to it|\b404\b/i.test(normalized)
    ? `模型“${model}”不可用，或当前密钥没有访问权限。请在设置中更换可用模型，或确认服务商权限。`
    : "本次生成未完成。请检查模型配置、网络连接或服务商权限后重试。";
  return { summary, details: content.trim() };
}

function AgentFailureCard({ failure }: { failure: { summary: string; details: string } }): JSX.Element {
  return (
    <section className="agent-failure-card" role="alert">
      <div className="agent-failure-heading">
        <CircleAlert size={17} />
        <div>
          <strong>模型调用失败</strong>
          <p>{failure.summary}</p>
        </div>
      </div>
      <details className="agent-failure-details">
        <summary>查看技术详情</summary>
        <pre>{failure.details}</pre>
      </details>
    </section>
  );
}

function ThinkingIndicator(): JSX.Element {
  return (
    <div className="thinking-indicator" role="status" aria-live="polite" aria-label="Agent 正在思考">
      <span className="thinking-label">正在思考</span>
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function ToolRow({ item, embedded = false }: { item: Extract<StreamItem, { kind: "tool" }>; embedded?: boolean }): JSX.Element {
  const hasDetails = Boolean(item.inputPreview || item.outputPreview || item.errorPreview);

  return (
    <Collapsible.Root className={`tool-row ${item.status}${embedded ? " embedded" : ""}`}>
      <div className="tool-row-main">
        {item.status === "running" ? (
          <Loader2 size={14} className="spin" />
        ) : item.status === "failed" ? (
          <XCircle size={14} />
        ) : (
          <CheckCircle2 size={14} />
        )}
        <div className="tool-row-content">
          <span className="tool-name">{item.toolName}</span>
          {item.summary ? <span className="tool-summary">{item.summary}</span> : null}
        </div>
        {hasDetails ? (
          <Collapsible.Trigger asChild>
            <button type="button" className="tool-detail-trigger" aria-label={`查看 ${item.toolName} 的详情`} title="查看详情">
              <ChevronDown size={13} />
            </button>
          </Collapsible.Trigger>
        ) : null}
      </div>
      {hasDetails ? (
        <Collapsible.Content className="tool-detail">
          {item.inputPreview ? <ToolDetailBlock title="输入" content={item.inputPreview} /> : null}
          {item.outputPreview ? <ToolDetailBlock title="输出" content={item.outputPreview} /> : null}
          {item.errorPreview ? <ToolDetailBlock title="错误" content={item.errorPreview} /> : null}
        </Collapsible.Content>
      ) : null}
    </Collapsible.Root>
  );
}

function ToolDetailBlock({ title, content }: { title: string; content: string }): JSX.Element {
  return (
    <section className="tool-detail-block">
      <span>{title}</span>
      <pre>{formatToolPreview(content)}</pre>
    </section>
  );
}

export function ArtifactActions({
  api,
  artifactId,
  onPreview,
  onError
}: {
  api: ArchAgentApi;
  artifactId: string;
  onPreview: () => void;
  onError: (message: string) => void;
}): JSX.Element {
  async function openArtifact(): Promise<void> {
    try {
      await api.artifact.open(artifactId);
    } catch (error) {
      onError(`打开文件失败：${getErrorMessage(error)}`);
    }
  }

  async function revealArtifact(): Promise<void> {
    try {
      await api.artifact.reveal(artifactId);
    } catch (error) {
      onError(`定位文件失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="file-actions">
      <button type="button" className="file-quick-action" onClick={onPreview}>
        <Eye size={14} />
        查看
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="file-menu-button" aria-label="打开文件操作菜单">
            <MoreHorizontal size={15} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="dropdown-content" align="end" sideOffset={6}>
            <DropdownMenu.Item
              className="dropdown-item"
              onSelect={() => void openArtifact()}
            >
              <File size={14} />
              系统打开
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="dropdown-item"
              onSelect={() => void revealArtifact()}
            >
              <FolderOpen size={14} />
              在文件夹中定位
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
