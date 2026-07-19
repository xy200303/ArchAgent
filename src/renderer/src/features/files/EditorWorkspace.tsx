/** File and 3D editor workspace, including preview routing and editor chrome. */
import { lazy, memo, Suspense, type JSX } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import { IncremarkContent } from "@incremark/react";
import { ChevronRight, Eye, File, Files, FolderOpen, Image, PencilLine, X, XCircle } from "lucide-react";
import type { ArchAgentApi, ArtifactPreview, ResourcePreview } from "../../../../shared/types";
import { ErrorBoundary } from "../../platform/ErrorBoundary";
import { getErrorMessage } from "../../platform/bridge";
import { formatBytes, getWorkspaceFileIconSpec, resolveMonacoLanguage } from "../../shared/presentation";
import { PreviewLoadingPanel } from "./PreviewLoadingPanel";
import type { BuiltInComponentId, ComponentLibraryRequest } from "../modeling3d/editor/componentLibraryContracts";

const TextFileEditor = lazy(() =>
  import("./TextFileEditor").then((module) => ({ default: module.TextFileEditor }))
);
const SpatialEditor = lazy(() =>
  import("../modeling3d/viewer/SpatialEditor").then((module) => ({ default: module.SpatialEditor }))
);

export type WorkspacePreview = Omit<ArtifactPreview, "artifactId">;
export type PreviewContent = ArtifactPreview | ResourcePreview | WorkspacePreview;

export const EditorHeader = memo(function EditorHeader({
  preview,
  projectPath,
  dirty,
  mdEditMode,
  onToggleMdMode,
  onClose
}: {
  preview?: PreviewContent;
  projectPath: string;
  dirty: boolean;
  mdEditMode: boolean;
  onToggleMdMode: () => void;
  onClose: () => void;
}): JSX.Element {
  if (!preview) {
    return <header className="editor-header editor-header-empty" />;
  }

  const { Icon, className } = getWorkspaceFileIconSpec(preview.name);
  const breadcrumbSegments = resolveBreadcrumbSegments(preview.path, preview.name, projectPath);
  const mdToggleable = preview.kind === "md" && Boolean(preview.path);

  return (
    <header className="editor-header">
      <div className="editor-tabs" role="tablist" aria-label="文件标签">
        <div className="editor-tab active">
          <Icon size={14} className={className} />
          <span title={preview.path || preview.name}>{preview.name}</span>
          {dirty ? (
            <span className="editor-tab-dirty" aria-label="有未保存的修改" />
          ) : (
            <button type="button" className="editor-tab-close" onClick={onClose} aria-label="关闭文件">
              <X size={14} />
            </button>
          )}
        </div>
        {mdToggleable ? (
          <button
            type="button"
            className="editor-tab-action"
            onClick={onToggleMdMode}
            title={mdEditMode ? "查看渲染预览" : "编辑源码"}
            aria-label={mdEditMode ? "查看渲染预览" : "编辑源码"}
          >
            {mdEditMode ? <Eye size={15} /> : <PencilLine size={15} />}
          </button>
        ) : null}
      </div>
      {breadcrumbSegments.length > 1 ? (
        <div className="editor-breadcrumb">
          {breadcrumbSegments.map((segment, index) => (
            <span className="breadcrumb-item" key={`${segment}-${index}`}>
              {index > 0 ? <ChevronRight size={12} className="breadcrumb-separator" /> : null}
              {index === breadcrumbSegments.length - 1 ? <Icon size={13} className={className} /> : null}
              {segment}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
});

function resolveBreadcrumbSegments(filePath: string | undefined, fileName: string, projectPath: string): string[] {
  if (!filePath) return [fileName];
  const normalize = (value: string) => value.replace(/\\/g, "/");
  const normalizedPath = normalize(filePath);
  const normalizedProject = normalize(projectPath).replace(/\/+$/, "");
  const relative =
    normalizedPath.toLowerCase().startsWith(`${normalizedProject.toLowerCase()}/`)
      ? normalizedPath.slice(normalizedProject.length + 1)
      : normalizedPath;
  return relative.split("/").filter(Boolean);
}

export const EditorWorkspace = memo(function EditorWorkspace({
  api,
  preview,
  previewError,
  selectedArtifactId,
  theme,
  mdMode,
  componentRequest,
  sidebarMode,
  onSelectBuiltInComponent,
  onPreviewArtifact,
  onSaveContent,
  onDirtyChange,
  onError
}: {
  api: ArchAgentApi;
  preview?: PreviewContent;
  previewError: string;
  selectedArtifactId?: string;
  theme: "light" | "dark";
  mdMode: "preview" | "edit";
  componentRequest?: ComponentLibraryRequest;
  sidebarMode?: "scene" | "components";
  onSelectBuiltInComponent: (componentId: BuiltInComponentId) => void;
  onPreviewArtifact: (artifactId: string) => void;
  onSaveContent: (path: string, content: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string) => void;
}): JSX.Element {
  if (previewError) {
    return (
      <section className="editor-empty-state error">
        <XCircle size={28} />
        <strong>预览失败</strong>
        <span>{previewError}</span>
      </section>
    );
  }

  if (selectedArtifactId && !preview) {
    return <PreviewLoadingPanel />;
  }

  if (preview) {
    return (
      <InlineArtifactPreview
        key={getPreviewKey(preview)}
        api={api}
        preview={preview}
        theme={theme}
        mdMode={mdMode}
        onSaveContent={onSaveContent}
        onDirtyChange={onDirtyChange}
        onError={onError}
      />
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<PreviewLoadingPanel />}>
        <SpatialEditor
          api={api}
          componentRequest={componentRequest}
          sidebarMode={sidebarMode}
          onSelectBuiltInComponent={onSelectBuiltInComponent}
        />
      </Suspense>
    </ErrorBoundary>
  );
});

export function getPreviewKey(preview: PreviewContent): string {
  return ("artifactId" in preview && preview.artifactId) || ("resourceId" in preview && preview.resourceId) || preview.path || preview.name;
}

function InlineArtifactPreview({
  api,
  preview,
  theme,
  mdMode,
  onSaveContent,
  onDirtyChange,
  onError
}: {
  api: ArchAgentApi;
  preview: PreviewContent;
  theme: "light" | "dark";
  mdMode: "preview" | "edit";
  onSaveContent: (path: string, content: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string) => void;
}): JSX.Element {
  if (preview.mode === "text" && preview.text !== undefined) {
    const truncated = preview.text.includes("[内容过长，已截断");
    const editorProps = {
      name: preview.name,
      path: preview.path,
      value: preview.text,
      language: resolveMonacoLanguage(preview.name),
      theme,
      readOnly: truncated,
      readOnlyReason: truncated ? "内容过长已截断，仅支持只读查看" : undefined,
      onDirtyChange,
      onError,
      onSave: preview.path ? (content: string) => onSaveContent(preview.path as string, content) : undefined
    };

    if (preview.kind === "md") {
      const editable = Boolean(preview.path) && !truncated;

      if (mdMode === "edit" && editable) {
        return (
          <Suspense fallback={<PreviewLoadingPanel />}>
            <TextFileEditor {...editorProps} />
          </Suspense>
        );
      }

      return (
        <section className="inline-preview">
          <ScrollArea.Root className="preview-scroll inline-preview-scroll">
            <ScrollArea.Viewport className="preview-body inline-preview-body">
              <div className="preview-markdown">
                <IncremarkContent content={preview.text} isFinished />
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="scrollbar-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </section>
      );
    }

    return (
      <Suspense fallback={<PreviewLoadingPanel />}>
        <TextFileEditor {...editorProps} />
      </Suspense>
    );
  }

  if (preview.mode === "unsupported" || (preview.mode === "image" && !preview.dataUrl)) {
    return <UnsupportedFilePreview api={api} preview={preview} onError={onError} />;
  }

  return (
    <section className="inline-preview">
      <ScrollArea.Root className="preview-scroll inline-preview-scroll">
        <ScrollArea.Viewport className="preview-body inline-preview-body">
          {preview.mode === "image" && preview.dataUrl ? (
            <img src={preview.dataUrl} alt={preview.name} className="inline-preview-image" />
          ) : null}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </section>
  );
}

function UnsupportedFilePreview({
  api,
  preview,
  onError
}: {
  api: ArchAgentApi;
  preview: PreviewContent;
  onError: (message: string) => void;
}): JSX.Element {
  const { Icon, className } = getWorkspaceFileIconSpec(preview.name);

  async function openInSystem(): Promise<void> {
    if (!preview.path) return;
    try {
      await api.file.open(preview.path);
    } catch (error) {
      onError(`打开文件失败：${getErrorMessage(error)}`);
    }
  }

  async function revealInFolder(): Promise<void> {
    if (!preview.path) return;
    try {
      await api.file.reveal(preview.path);
    } catch (error) {
      onError(`定位文件失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <section className="editor-empty-state">
      <div className="empty-hero-icon">
        <Icon size={28} className={className} />
      </div>
      <strong>{preview.name}</strong>
      <span>
        {preview.kind.toUpperCase()}
        {preview.size ? ` · ${formatBytes(preview.size)}` : ""}
        {" · "}
        {preview.summary || "该类型文件暂不支持内联预览"}
      </span>
      {preview.path ? (
        <div className="unsupported-file-actions">
          <button type="button" className="primary-action" onClick={() => void openInSystem()}>
            <FolderOpen size={15} />
            在系统中打开
          </button>
          <button type="button" className="secondary-action" onClick={() => void revealInFolder()}>
            <Files size={15} />
            在文件管理器中显示
          </button>
        </div>
      ) : null}
    </section>
  );
}
