/** Dialogs for artifact history and destructive or mutating chat-session actions. */
import { useEffect, useState, type FormEvent, type JSX } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { File, Files, Image, Loader2, PencilLine, Trash2, X } from "lucide-react";
import type { ArchAgentApi, ArtifactSummary, ChatSession } from "../../../../shared/types";
import { formatBytes, formatDateTime, isImageKind, resolveSessionTitle } from "../../shared/presentation";
import { ArtifactActions } from "./MessagePane";

export function ArtifactHistoryPanel({
  artifacts,
  sessions,
  onClose,
  api,
  onError,
  onPreviewArtifact
}: {
  artifacts: ArtifactSummary[];
  sessions: ChatSession[];
  onClose: () => void;
  api: ArchAgentApi;
  onError: (message: string) => void;
  onPreviewArtifact: (artifactId: string) => void;
}): JSX.Element {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="preview-backdrop" />
        <Dialog.Content className="artifact-history-panel">
          <header>
            <div>
              <Dialog.Title asChild>
                <strong>交付文件</strong>
              </Dialog.Title>
              <Dialog.Description>{artifacts.length ? `共 ${artifacts.length} 个生成产物` : "暂无生成产物"}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="关闭交付文件">
                <X size={16} />
              </button>
            </Dialog.Close>
          </header>
          <ScrollArea.Root className="artifact-history-scroll">
            <ScrollArea.Viewport className="artifact-history-body">
              {artifacts.length === 0 ? (
                <div className="artifact-empty">
                  <Files size={26} />
                  <strong>还没有交付文件</strong>
                  <span>分析报告、图表、仪表盘和导出的数据文件会出现在这里。</span>
                </div>
              ) : (
                artifacts.map((artifact) => (
                  <div className="artifact-history-row" key={artifact.id}>
                    {isImageKind(artifact.kind) ? <Image size={16} /> : <File size={16} />}
                    <div className="artifact-history-main">
                      <strong>{artifact.name}</strong>
                      <span>
                        {artifact.kind.toUpperCase()} · {formatBytes(artifact.size)} ·{" "}
                        {resolveSessionTitle(sessions, artifact.sessionId)}
                      </span>
                    </div>
                    <time>{formatDateTime(artifact.createdAt)}</time>
                    <ArtifactActions
                      api={api}
                      artifactId={artifact.id}
                      onPreview={() => onPreviewArtifact(artifact.id)}
                      onError={onError}
                    />
                  </div>
                ))
              )}
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="scrollbar-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RenameSessionDialog({
  session,
  onClose,
  onRename
}: {
  session: ChatSession;
  onClose: () => void;
  onRename: (sessionId: string, title: string) => Promise<void>;
}): JSX.Element {
  const [title, setTitle] = useState(session.title);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(session.title);
    setError("");
  }, [session]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("对话名称不能为空");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onRename(session.id, nextTitle);
      onClose();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" />
        <Dialog.Content className="modal-panel rename-panel">
          <form onSubmit={(event) => void submit(event)}>
            <Dialog.Title asChild>
              <h2>重命名对话</h2>
            </Dialog.Title>
            <Dialog.Description>给这次分析任务取一个更容易识别的名称。</Dialog.Description>
            <label>
              对话名称
              <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <footer>
              <Dialog.Close asChild>
                <button type="button" className="secondary-action">
                  取消
                </button>
              </Dialog.Close>
              <button type="submit" className="send-action" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <PencilLine size={14} />}
                保存
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DeleteSessionDialog({
  session,
  onClose,
  onDelete
}: {
  session: ChatSession;
  onClose: () => void;
  onDelete: (sessionId: string) => Promise<void>;
}): JSX.Element {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete(): Promise<void> {
    setDeleting(true);
    setError("");
    try {
      await onDelete(session.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      setDeleting(false);
    }
  }

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-backdrop" />
        <AlertDialog.Content className="modal-panel delete-panel">
          <AlertDialog.Title asChild>
            <h2>删除这个对话？</h2>
          </AlertDialog.Title>
          <AlertDialog.Description>
            将从侧边栏移除“{session.title}”及其聊天记录。已生成到磁盘的设计产物不会被删除。
          </AlertDialog.Description>
          {error ? <p className="form-error">{error}</p> : null}
          <footer>
            <AlertDialog.Cancel asChild>
              <button type="button" className="secondary-action" disabled={deleting}>
                取消
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className="danger-action"
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault();
                  void confirmDelete();
                }}
              >
                {deleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                删除
              </button>
            </AlertDialog.Action>
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
