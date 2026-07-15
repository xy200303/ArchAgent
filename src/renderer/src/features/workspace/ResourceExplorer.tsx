/** Project workspace tree and root-level file or directory creation controls. */
import {
  useEffect,
  useState,
  type FormEvent,
  type JSX,
  type MouseEvent,
  type ReactNode
} from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { ChevronDown, ChevronRight, FilePlus2, FolderPlus, Loader2 } from "lucide-react";
import type { ArchAgentApi, ProjectInfo, WorkspaceFileItem } from "../../../../shared/types";
import { getErrorMessage } from "../../platform/bridge";
import {
  getWorkspaceFileIconSpec,
  isSafeWorkspaceEntryName,
  joinWorkspacePath
} from "../../shared/presentation";

export function ResourceExplorer(props: {
  api: ArchAgentApi;
  project?: ProjectInfo;
  files: WorkspaceFileItem[];
  selectedFilePath?: string;
  onPreviewFile: (file: WorkspaceFileItem) => void;
  onFilesChanged: () => void;
}): JSX.Element {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | undefined>();
  const [entryKind, setEntryKind] = useState<"file" | "directory" | undefined>();
  const workspaceTitle = props.project?.name || "未打开项目";

  useEffect(() => {
    if (!contextMenu) return;

    function closeContextMenu(): void {
      setContextMenu(undefined);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") closeContextMenu();
    }

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  function openExplorerContextMenu(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 176),
      y: Math.min(event.clientY, window.innerHeight - 96)
    });
  }

  async function createEntry(name: string): Promise<void> {
    if (!props.project || !entryKind) return;
    const targetPath = joinWorkspacePath(props.project.path, name);
    if (entryKind === "file") {
      await props.api.file.create({ path: targetPath });
    } else {
      await props.api.file.createDirectory({ path: targetPath });
    }
    setEntryKind(undefined);
    props.onFilesChanged();
  }

  return (
    <aside className="resource-sidebar" onContextMenu={openExplorerContextMenu}>
      <ScrollArea.Root className="explorer-scroll">
        <ScrollArea.Viewport className="explorer-viewport">
          <div className="workspace-file-tree">
            <div className="workspace-row active">
              <ChevronDown size={15} />
              <strong title={workspaceTitle}>{workspaceTitle}</strong>
            </div>
            <div className="workspace-file-children">
              {props.files.length ? (
                props.files.map((file) => (
                  <WorkspaceTreeItem
                    file={file}
                    depth={0}
                    key={file.path}
                    selectedFilePath={props.selectedFilePath}
                    onPreviewFile={props.onPreviewFile}
                  />
                ))
              ) : (
                <ExplorerEmpty label="此项目还没有文件" />
              )}
            </div>
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      {contextMenu ? (
        <ExplorerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(undefined)}
          onCreateFile={() => setEntryKind("file")}
          onCreateDirectory={() => setEntryKind("directory")}
        />
      ) : null}
      {entryKind ? (
        <NewWorkspaceEntryDialog
          kind={entryKind}
          onClose={() => setEntryKind(undefined)}
          onCreate={createEntry}
        />
      ) : null}
    </aside>
  );
}

function WorkspaceTreeItem({
  file,
  depth,
  selectedFilePath,
  onPreviewFile
}: {
  file: WorkspaceFileItem;
  depth: number;
  selectedFilePath?: string;
  onPreviewFile: (file: WorkspaceFileItem) => void;
}): JSX.Element {
  const [open, setOpen] = useState(depth < 1);
  const paddingLeft = 30 + depth * 16;

  if (file.kind === "file") {
    const { Icon, className } = getWorkspaceFileIconSpec(file.name);
    return (
      <button
        type="button"
        className={file.path === selectedFilePath ? "explorer-file-row active" : "explorer-file-row"}
        style={{ paddingLeft }}
        onClick={() => onPreviewFile(file)}
      >
        <Icon size={15} className={className} />
        <strong title={file.name}>{file.name}</strong>
      </button>
    );
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger asChild>
        <button type="button" className="workspace-tree-directory" style={{ paddingLeft }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <strong title={file.name}>{file.name}</strong>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="workspace-tree-children">
        {file.children?.map((child) => (
          <WorkspaceTreeItem
            file={child}
            depth={depth + 1}
            key={child.path}
            selectedFilePath={selectedFilePath}
            onPreviewFile={onPreviewFile}
          />
        ))}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function ExplorerContextMenu({
  x,
  y,
  onClose,
  onCreateFile,
  onCreateDirectory
}: {
  x: number;
  y: number;
  onClose: () => void;
  onCreateFile: () => void;
  onCreateDirectory: () => void;
}): JSX.Element {
  return (
    <div
      className="explorer-context-menu"
      role="menu"
      aria-label="项目文件夹菜单"
      style={{ left: x, top: y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCreateFile();
          onClose();
        }}
      >
        <FilePlus2 size={14} />
        <span>新建文件</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCreateDirectory();
          onClose();
        }}
      >
        <FolderPlus size={14} />
        <span>新建文件夹</span>
      </button>
    </div>
  );
}

function NewWorkspaceEntryDialog({
  kind,
  onClose,
  onCreate
}: {
  kind: "file" | "directory";
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const isFile = kind === "file";
  const label = isFile ? "新建文件" : "新建文件夹";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!isSafeWorkspaceEntryName(trimmedName)) {
      setError("名称不能为空，且不能包含路径分隔符或保留字符。");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await onCreate(trimmedName);
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="settings-backdrop" />
        <Dialog.Content className="workspace-entry-dialog">
          <Dialog.Title>{label}</Dialog.Title>
          <Dialog.Description>文件将创建在当前项目根目录。</Dialog.Description>
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="workspace-entry-name">名称</label>
            <input
              autoFocus
              id="workspace-entry-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isFile ? "例如：analysis.py" : "例如：data"}
            />
            {error ? <p className="workspace-entry-error" role="alert">{error}</p> : null}
            <footer>
              <button type="button" className="secondary-action" onClick={onClose} disabled={creating}>
                取消
              </button>
              <button type="submit" className="send-action" disabled={creating}>
                {creating ? <Loader2 size={14} className="spin" /> : null}
                创建
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ExplorerSection({
  title,
  count,
  defaultOpen,
  children
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <Collapsible.Root className="explorer-section" defaultOpen={defaultOpen}>
      <Collapsible.Trigger asChild>
        <button type="button" className="explorer-section-trigger">
          <ChevronDown size={14} />
          <span>{title}</span>
          <small>{count}</small>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="explorer-section-content">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

function ExplorerEmpty({ label }: { label: string }): JSX.Element {
  return <div className="explorer-empty">{label}</div>;
}
