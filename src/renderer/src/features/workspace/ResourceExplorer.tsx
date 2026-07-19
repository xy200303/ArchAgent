/** VS Code-style project tree and contextual file operations. */
import { memo, useCallback, useEffect, useRef, useState, type JSX, type MouseEvent } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  ChevronDown,
  ChevronRight,
  Files,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  PencilLine,
  RefreshCw,
  Trash2
} from "lucide-react";
import type { ArchAgentApi, ProjectInfo, WorkspaceFileItem } from "../../../../shared/types";
import { getErrorMessage } from "../../platform/bridge";
import { getWorkspaceFileIconSpec, isSafeWorkspaceEntryName, joinWorkspacePath } from "../../shared/presentation";
import { SidePanelHeader } from "../../shared/SidePanelHeader";

type EntryKind = "file" | "directory";
type ContextTarget = { path: string; name: string; kind: "root" | WorkspaceFileItem["kind"] };

export function ResourceExplorer(props: {
  api: ArchAgentApi;
  project?: ProjectInfo;
  files: WorkspaceFileItem[];
  selectedFilePath?: string;
  onPreviewFile: (file: WorkspaceFileItem) => void;
  onFilesChanged: () => void;
}): JSX.Element {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextTarget }>();
  const [entryRequest, setEntryRequest] = useState<{ kind: EntryKind; parentPath: string }>();
  const [renameTarget, setRenameTarget] = useState<ContextTarget>();
  const [collapseRevision, setCollapseRevision] = useState(0);
  const [operationError, setOperationError] = useState("");
  const workspaceTitle = props.project?.name || "未打开项目";
  const rootTarget: ContextTarget | undefined = props.project
    ? { path: props.project.path, name: workspaceTitle, kind: "root" }
    : undefined;

  useEffect(() => {
    if (!contextMenu) return;
    const close = (): void => setContextMenu(undefined);
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const openContextMenu = useCallback((event: MouseEvent<HTMLElement>, target: ContextTarget): void => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 208),
      y: Math.min(event.clientY, window.innerHeight - 240),
      target
    });
  }, []);

  const createEntry = useCallback(async (name: string): Promise<void> => {
    if (!entryRequest) return;
    const targetPath = joinWorkspacePath(entryRequest.parentPath, name);
    if (entryRequest.kind === "file") await props.api.file.create({ path: targetPath });
    else await props.api.file.createDirectory({ path: targetPath });
    setEntryRequest(undefined);
    props.onFilesChanged();
  }, [entryRequest, props.api, props.onFilesChanged]);

  const renameEntry = useCallback(async (name: string): Promise<void> => {
    if (!renameTarget) return;
    await props.api.file.rename({ path: renameTarget.path, name });
    setRenameTarget(undefined);
    props.onFilesChanged();
  }, [props.api, props.onFilesChanged, renameTarget]);

  const deleteEntry = useCallback(async (target: ContextTarget): Promise<void> => {
    await props.api.file.delete({ path: target.path });
    props.onFilesChanged();
  }, [props.api, props.onFilesChanged]);

  const runOperation = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    setOperationError("");
    try {
      await operation();
    } catch (error) {
      setOperationError(getErrorMessage(error));
    }
  }, []);
  const cancelEntry = useCallback((): void => setEntryRequest(undefined), []);
  const cancelRename = useCallback((): void => setRenameTarget(undefined), []);

  return (
    <aside
      className="resource-sidebar"
      onContextMenu={(event) => rootTarget && openContextMenu(event, rootTarget)}
    >
      <SidePanelHeader
        title="资源管理器"
        icon={Files}
        meta={workspaceTitle}
        actions={(
          <button type="button" className="resource-icon-button" aria-label="刷新项目文件" title="刷新项目文件" onClick={props.onFilesChanged}>
            <RefreshCw size={15} />
          </button>
        )}
      />
      {operationError ? <p className="explorer-operation-error" role="alert">{operationError}</p> : null}
      <ScrollArea.Root className="explorer-scroll">
        <ScrollArea.Viewport className="explorer-viewport">
          <div className="workspace-file-tree">
            <button
              type="button"
              className="workspace-row active"
              onContextMenu={(event) => rootTarget && openContextMenu(event, rootTarget)}
            >
              <ChevronDown size={15} />
              <strong title={workspaceTitle}>{workspaceTitle}</strong>
            </button>
            <div className="workspace-file-children">
              {props.files.length ? (
                props.files.map((file) => (
                  <WorkspaceTreeItem
                    collapseRevision={collapseRevision}
                    file={file}
                    depth={0}
                    key={file.path}
                    selectedFilePath={props.selectedFilePath}
                    entryRequest={entryRequest}
                    renameTarget={renameTarget}
                    onCancelEntry={cancelEntry}
                    onCreateEntry={createEntry}
                    onCancelRename={cancelRename}
                    onRename={renameEntry}
                    onContextMenu={openContextMenu}
                    onPreviewFile={props.onPreviewFile}
                  />
                ))
              ) : (
                <ExplorerEmpty label="此项目还没有文件" />
              )}
              {entryRequest && entryRequest.parentPath === rootTarget?.path ? (
                <InlineWorkspaceEntry
                  kind={entryRequest.kind}
                  paddingLeft={30}
                  onCancel={cancelEntry}
                  onCreate={createEntry}
                />
              ) : null}
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
          target={contextMenu.target}
          onClose={() => setContextMenu(undefined)}
          onCreateFile={() => setEntryRequest({ kind: "file", parentPath: contextMenu.target.kind === "file" ? getParentPath(contextMenu.target.path) : contextMenu.target.path })}
          onCreateDirectory={() => setEntryRequest({ kind: "directory", parentPath: contextMenu.target.kind === "file" ? getParentPath(contextMenu.target.path) : contextMenu.target.path })}
          onRename={() => setRenameTarget(contextMenu.target)}
          onDelete={() => void runOperation(() => deleteEntry(contextMenu.target))}
          onReveal={() => void runOperation(() => props.api.file.reveal(contextMenu.target.path))}
          onOpen={contextMenu.target.kind === "file" ? () => void runOperation(() => props.api.file.open(contextMenu.target.path)) : undefined}
          onRefresh={props.onFilesChanged}
          onCollapseAll={() => setCollapseRevision((revision) => revision + 1)}
        />
      ) : null}
    </aside>
  );
}

const WorkspaceTreeItem = memo(function WorkspaceTreeItem({
  collapseRevision,
  file,
  depth,
  selectedFilePath,
  entryRequest,
  renameTarget,
  onCancelEntry,
  onCreateEntry,
  onCancelRename,
  onRename,
  onContextMenu,
  onPreviewFile
}: {
  collapseRevision: number;
  file: WorkspaceFileItem;
  depth: number;
  selectedFilePath?: string;
  entryRequest?: { kind: EntryKind; parentPath: string };
  renameTarget?: ContextTarget;
  onCancelEntry: () => void;
  onCreateEntry: (name: string) => Promise<void>;
  onCancelRename: () => void;
  onRename: (name: string) => Promise<void>;
  onContextMenu: (event: MouseEvent<HTMLElement>, target: ContextTarget) => void;
  onPreviewFile: (file: WorkspaceFileItem) => void;
}): JSX.Element {
  const [open, setOpen] = useState(depth < 1);
  const paddingLeft = 30 + depth * 16;

  useEffect(() => setOpen(false), [collapseRevision]);
  useEffect(() => {
    if (entryRequest?.parentPath === file.path) setOpen(true);
  }, [entryRequest?.parentPath, file.path]);

  if (file.kind === "file") {
    const { Icon, className } = getWorkspaceFileIconSpec(file.name);
    if (renameTarget?.path === file.path) {
      return (
        <InlineWorkspaceRename
          initialName={file.name}
          paddingLeft={paddingLeft}
          onCancel={onCancelRename}
          onRename={onRename}
        />
      );
    }
    return (
      <button
        type="button"
        className={file.path === selectedFilePath ? "explorer-file-row active" : "explorer-file-row"}
        style={{ paddingLeft }}
        onClick={() => onPreviewFile(file)}
        onContextMenu={(event) => onContextMenu(event, file)}
      >
        <Icon size={15} className={className} />
        <strong title={file.name}>{file.name}</strong>
      </button>
    );
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      {renameTarget?.path === file.path ? (
        <InlineWorkspaceRename
          initialName={file.name}
          paddingLeft={paddingLeft}
          onCancel={onCancelRename}
          onRename={onRename}
        />
      ) : (
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="workspace-tree-directory"
            style={{ paddingLeft }}
            onContextMenu={(event) => onContextMenu(event, file)}
          >
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <strong title={file.name}>{file.name}</strong>
          </button>
        </Collapsible.Trigger>
      )}
      <Collapsible.Content className="workspace-tree-children">
        {file.children?.map((child) => (
          <WorkspaceTreeItem
            collapseRevision={collapseRevision}
            file={child}
            depth={depth + 1}
            key={child.path}
            selectedFilePath={selectedFilePath}
            entryRequest={entryRequest}
            renameTarget={renameTarget}
            onCancelEntry={onCancelEntry}
            onCreateEntry={onCreateEntry}
            onCancelRename={onCancelRename}
            onRename={onRename}
            onContextMenu={onContextMenu}
            onPreviewFile={onPreviewFile}
          />
        ))}
        {entryRequest?.parentPath === file.path ? (
          <InlineWorkspaceEntry
            kind={entryRequest.kind}
            paddingLeft={30 + (depth + 1) * 16}
            onCancel={onCancelEntry}
            onCreate={onCreateEntry}
          />
        ) : null}
      </Collapsible.Content>
    </Collapsible.Root>
  );
});

function InlineWorkspaceEntry({
  kind,
  paddingLeft,
  onCancel,
  onCreate
}: {
  kind: EntryKind;
  paddingLeft: number;
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const cancelledRef = useRef(false);
  const submittingRef = useRef(false);
  const label = kind === "file" ? "新建文件" : "新建文件夹";

  async function submitName(): Promise<void> {
    if (submittingRef.current) return;
    const trimmedName = name.trim();
    if (!isSafeWorkspaceEntryName(trimmedName)) {
      setError("名称不能为空，且不能包含路径分隔符或保留字符。");
      return;
    }
    submittingRef.current = true;
    setCreating(true);
    setError("");
    try {
      await onCreate(trimmedName);
    } catch (createError) {
      setError(getErrorMessage(createError));
      setCreating(false);
      submittingRef.current = false;
    }
  }

  return (
    <form className="workspace-inline-entry" style={{ paddingLeft }} onSubmit={(event) => {
      event.preventDefault();
      void submitName();
    }}>
      {kind === "file" ? <FilePlus2 size={15} /> : <FolderPlus size={15} />}
      <input
        autoFocus
        aria-label={label}
        disabled={creating}
        placeholder={label}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (cancelledRef.current || submittingRef.current) return;
          if (!name.trim()) {
            onCancel();
            return;
          }
          void submitName();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelledRef.current = true;
            onCancel();
          }
        }}
      />
      {error ? <small role="alert">{error}</small> : null}
    </form>
  );
}

function InlineWorkspaceRename({
  initialName,
  paddingLeft,
  onCancel,
  onRename
}: {
  initialName: string;
  paddingLeft: number;
  onCancel: () => void;
  onRename: (name: string) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelledRef = useRef(false);
  const submittingRef = useRef(false);

  async function submitName(): Promise<void> {
    if (submittingRef.current) return;
    const trimmedName = name.trim();
    if (!isSafeWorkspaceEntryName(trimmedName)) {
      setError("名称不能为空，且不能包含路径分隔符或保留字符。");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onRename(trimmedName);
    } catch (renameError) {
      setError(getErrorMessage(renameError));
      setSaving(false);
      submittingRef.current = false;
    }
  }

  return (
    <form className="workspace-inline-entry" style={{ paddingLeft }} onSubmit={(event) => {
      event.preventDefault();
      void submitName();
    }}>
      <PencilLine size={15} />
      <input
        autoFocus
        aria-label="重命名"
        disabled={saving}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => {
          if (cancelledRef.current || submittingRef.current) return;
          if (!name.trim()) {
            onCancel();
            return;
          }
          void submitName();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelledRef.current = true;
            onCancel();
          }
        }}
      />
      {error ? <small role="alert">{error}</small> : null}
    </form>
  );
}

function ExplorerContextMenu({
  x,
  y,
  target,
  onClose,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
  onReveal,
  onOpen,
  onRefresh,
  onCollapseAll
}: {
  x: number;
  y: number;
  target: ContextTarget;
  onClose: () => void;
  onCreateFile: () => void;
  onCreateDirectory: () => void;
  onRename: () => void;
  onDelete: () => void;
  onReveal: () => void;
  onOpen?: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
}): JSX.Element {
  const run = (action: () => void): void => {
    action();
    onClose();
  };
  const canCreate = target.kind !== "file";
  const isRoot = target.kind === "root";

  return (
    <div className="explorer-context-menu" role="menu" aria-label={`${target.name} 操作菜单`} style={{ left: x, top: y }} onContextMenu={(event) => event.preventDefault()} onClick={(event) => event.stopPropagation()}>
      {canCreate ? <MenuAction icon={<FilePlus2 size={14} />} label="新建文件" onClick={() => run(onCreateFile)} /> : null}
      {canCreate ? <MenuAction icon={<FolderPlus size={14} />} label="新建文件夹" onClick={() => run(onCreateDirectory)} /> : null}
      {!isRoot ? <MenuAction icon={<PencilLine size={14} />} label="重命名" shortcut="F2" onClick={() => run(onRename)} /> : null}
      {!isRoot ? <MenuAction danger icon={<Trash2 size={14} />} label="删除" shortcut="Del" onClick={() => run(onDelete)} /> : null}
      {onOpen ? <MenuAction icon={<FolderOpen size={14} />} label="在系统中打开" onClick={() => run(onOpen)} /> : null}
      <MenuAction icon={<FolderOpen size={14} />} label="在资源管理器中显示" onClick={() => run(onReveal)} />
      {isRoot ? <MenuAction icon={<RefreshCw size={14} />} label="刷新" onClick={() => run(onRefresh)} /> : null}
      {isRoot ? <MenuAction icon={<ChevronRight size={14} />} label="折叠全部" onClick={() => run(onCollapseAll)} /> : null}
    </div>
  );
}

function MenuAction({ icon, label, shortcut, danger, onClick }: { icon: JSX.Element; label: string; shortcut?: string; danger?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" role="menuitem" className={danger ? "danger" : undefined} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {shortcut ? <small>{shortcut}</small> : null}
    </button>
  );
}

function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(0, normalized.lastIndexOf("/")) || path;
}

function ExplorerEmpty({ label }: { label: string }): JSX.Element {
  return <div className="explorer-empty">{label}</div>;
}
