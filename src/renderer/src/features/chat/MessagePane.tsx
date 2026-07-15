/** Chat transcript rendering, process grouping, tool details, and artifact actions. */
import { useEffect, useRef, type JSX } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { IncremarkContent } from "@incremark/react";
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  Eye,
  File,
  FileSpreadsheet,
  FolderOpen,
  Image,
  Loader2,
  Menu,
  MoreHorizontal,
  User,
  XCircle
} from "lucide-react";
import type { ArchAgentApi, ChatSession, StreamItem } from "../../../../shared/types";
import { getErrorMessage } from "../../platform/bridge";
import {
  groupStreamItemsForDisplay,
  orderStreamItemsForDisplay,
  type ProcessStreamItem
} from "./streamOrdering";
import { formatToolPreview, isImageKind } from "../../shared/presentation";

export function MessagePane({
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
  const orderedItems = session ? orderStreamItemsForDisplay(session.items) : [];
  const displayBlocks = session ? groupStreamItemsForDisplay(session.items) : [];
  const shouldShowPendingThinking = Boolean(
    session?.status === "running" && !orderedItems.some(isUnfinishedAssistantMessage)
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.items.length, session?.items.at(-1)]);

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
                <FileSpreadsheet size={14} />
                3D 建模
              </span>
              <span>
                <Activity size={14} />
                实时预览
              </span>
              <span>
                <BarChart3 size={14} />
                模型导出
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
            {shouldShowPendingThinking ? <PendingAssistantRow /> : null}
          </>
        )}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
        <ScrollArea.Thumb className="scrollbar-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
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

function ProcessCard({
  api,
  items,
  onPreviewArtifact,
  onError
}: {
  api: ArchAgentApi;
  items: ProcessStreamItem[];
  onPreviewArtifact: (artifactId: string) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const status = resolveProcessCardStatus(items);

  return (
    <Collapsible.Root className={`process-card ${status}`} defaultOpen>
      <div className="process-card-toolbar">
        <ProcessCardStatusIcon status={status} />
        <span className="process-card-title">过程记录</span>
        <span className="process-card-count">{formatProcessCardCounts(items)}</span>
        <span className="process-card-summary">{formatProcessCardSummary(items)}</span>
        <Collapsible.Trigger asChild>
          <button type="button" className="process-card-toggle" aria-label="展开或折叠过程记录">
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

function formatProcessCardSummary(items: ProcessStreamItem[]): string {
  const latest = items.at(-1);
  if (!latest) return "等待执行";
  if (latest.kind === "message") return compactInlineText(latest.content) || "过程说明";
  if (latest.kind === "file") return `已生成 ${latest.name}`;
  if (latest.kind === "stage") return [latest.title, latest.detail].filter(Boolean).join(" · ");
  return latest.summary || `工具 ${latest.toolName}`;
}

function compactInlineText(value: string, maxLength = 48): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function StreamRow({
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
    return (
      <article className={`message-row ${item.role}`}>
        {!isUser ? <div className="avatar"><Bot size={15} /></div> : null}
        <div className="message-body">
          {item.role === "assistant" ? (
            item.content.trim() ? (
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
        <span className="tool-name">{item.toolName}</span>
        <span className="tool-summary">{item.summary}</span>
        {hasDetails ? (
          <Collapsible.Trigger asChild>
            <button type="button" className="tool-detail-trigger">
              详情
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
