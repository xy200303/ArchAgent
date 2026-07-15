/** Chat composer with bounded attachment, paste, drop, submit, and cancel flows. */
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type JSX,
  type KeyboardEvent
} from "react";
import { ArrowDown, File, Files, Paperclip, Square, Trash2, Upload } from "lucide-react";
import type { ArchAgentApi, AttachmentRef, ChatSession } from "../../../../shared/types";
import { getErrorMessage } from "../../platform/bridge";
import { TooltipButton } from "../../shared/TooltipButton";
import { filesToAttachmentPayload } from "./attachmentPayload";

export function Composer(props: {
  api: ArchAgentApi;
  session?: ChatSession;
  value: string;
  attachments: AttachmentRef[];
  onChange: (value: string) => void;
  onAddAttachments: (attachments: AttachmentRef[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSent: (sessionId: string) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const canSend = Boolean(props.session && (props.value.trim() || props.attachments.length));
  const running = props.session?.status === "running";
  const [draggingFiles, setDraggingFiles] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function adjustTextareaHeight(): void {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    adjustTextareaHeight();
  }, [props.value]);

  async function submit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (!props.session || !canSend) return;
    try {
      await props.api.chat.prompt({
        sessionId: props.session.id,
        message: props.value.trim(),
        attachments: props.attachments
      });
      props.onSent(props.session.id);
    } catch (error) {
      props.onError(`发送失败：${getErrorMessage(error)}`);
    }
  }

  async function chooseFiles(): Promise<void> {
    if (!props.session) return;
    try {
      const picked = await props.api.attachment.pick({ sessionId: props.session.id, multiple: true });
      props.onAddAttachments(picked);
    } catch (error) {
      props.onError(`选择附件失败：${getErrorMessage(error)}`);
    }
  }

  async function importFiles(files: File[], actionLabel: string, source: "clipboard" | "drop"): Promise<void> {
    if (!props.session) return;
    if (files.length === 0) return;
    try {
      const payload = await filesToAttachmentPayload(files);
      const imported = await props.api.attachment.importClipboard({
        sessionId: props.session.id,
        source,
        files: payload
      });
      props.onAddAttachments(imported);
    } catch (error) {
      props.onError(`${actionLabel}附件失败：${getErrorMessage(error)}`);
    }
  }

  async function onPaste(event: ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    await importFiles(files, "粘贴", "clipboard");
  }

  function onDragOver(event: DragEvent<HTMLFormElement>): void {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = props.session ? "copy" : "none";
    setDraggingFiles(true);
  }

  function onDragLeave(event: DragEvent<HTMLFormElement>): void {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDraggingFiles(false);
  }

  async function onDrop(event: DragEvent<HTMLFormElement>): Promise<void> {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDraggingFiles(false);
    await importFiles(Array.from(event.dataTransfer.files), "拖入", "drop");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  return (
    <form
      className={draggingFiles ? "composer dragging-files" : "composer"}
      onSubmit={(event) => void submit(event)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(event) => void onDrop(event)}
    >
      <div className="composer-box">
        {props.attachments.length ? (
          <div className="attachment-strip">
            {props.attachments.map((attachment) => (
              <span className="attachment-chip" key={attachment.id}>
                <File size={14} />
                <span className="attachment-name" title={attachment.name}>
                  {attachment.name}
                </span>
                <button type="button" className="attachment-remove" onClick={() => props.onRemoveAttachment(attachment.id)} aria-label="移除附件">
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={props.value}
          onChange={(event) => {
            props.onChange(event.target.value);
            adjustTextareaHeight();
          }}
          onKeyDown={onKeyDown}
          onPaste={(event) => void onPaste(event)}
          placeholder="描述分析目标，或粘贴/选择 CSV、Excel、JSON、PDF、图片和文本数据..."
        />
        {draggingFiles ? (
          <div className="composer-drop-indicator">
            <Upload size={18} />
            松开即可添加附件
          </div>
        ) : null}
        <div className="composer-actions">
          <TooltipButton label="选择数据文件或参考资料" className="icon-action attachment-button" onClick={chooseFiles}>
            <Paperclip size={18} />
          </TooltipButton>
          <div className="spacer" />
          {running ? (
            <TooltipButton
              label="停止当前 Agent 生成"
              className="secondary-action stop-action"
              onClick={() => void props.api.chat.abort(props.session!.id)}
            >
              <Square size={14} />
              停止
            </TooltipButton>
          ) : null}
          <button
            type="submit"
            className="send-action"
            disabled={!canSend || running}
            aria-label="发送"
            title="发送"
          >
            <ArrowDown size={18} />
          </button>
        </div>
      </div>
    </form>
  );
}
