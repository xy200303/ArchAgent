/** Composes the renderer shell and coordinates state across domain features. */
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import { ActivityBar } from "./ActivityBar";
import {
  applyRendererEvent,
  setArtifacts,
  setCurrentProject,
  setCurrentSession,
  setRecentProjects,
  setSessions,
  setSettings,
  setSettingsOpen,
  upsertSession,
  type AppDispatch,
  type RootState
} from "./store";
import { FALLBACK_APP_METADATA } from "../../../shared/appMetadata";
import type { AppMetadata, ArtifactKind, ArtifactSummary, ArchAgentApi, ChatSession, WorkspaceFileItem } from "../../../shared/types";
import { ChatWorkspace } from "../features/chat/ChatWorkspace";
import {
  EditorHeader,
  EditorWorkspace,
  getPreviewKey,
  type PreviewContent
} from "../features/files/EditorWorkspace";
import type { BuiltInComponentId, ComponentLibraryRequest } from "../features/modeling3d/editor/componentLibraryContracts";
import { useResizableChatPanel } from "../features/layout/useResizableChatPanel";
import { ProjectPicker } from "../features/projects/ProjectPicker";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { ResourceExplorer } from "../features/workspace/ResourceExplorer";
import { CurrentResourcesPanel } from "../features/workspace/CurrentResourcesPanel";
import { getErrorMessage, resolveArchAgentApi } from "../platform/bridge";
import { getInitialProjectFromUrl } from "../shared/presentation";

export function App(): JSX.Element {
  const dispatch = useDispatch<AppDispatch>();
  const {
    settings,
    settingsOpen,
    artifacts,
    currentProject,
    recentProjects,
    sessions,
    currentSessionId
  } = useSelector(
    (state: RootState) => ({
      settings: state.chat.settings,
      settingsOpen: state.chat.settingsOpen,
      artifacts: state.chat.artifacts,
      currentProject: state.chat.currentProject,
      recentProjects: state.chat.recentProjects,
      sessions: state.chat.sessions,
      currentSessionId: state.chat.currentSessionId
    }),
    shallowEqual
  );
  const [preview, setPreview] = useState<PreviewContent | undefined>();
  const [previewError, setPreviewError] = useState("");
  const [previewDirty, setPreviewDirty] = useState(false);
  const [mdEditMode, setMdEditMode] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | undefined>();
  const [activeSidePanel, setActiveSidePanel] = useState<"explorer" | "resources" | "scene" | "components" | undefined>("explorer");
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileItem[]>([]);
  const [componentRequest, setComponentRequest] = useState<ComponentLibraryRequest>();
  const workbenchRef = useRef<HTMLDivElement>(null);
  const chatPanelResize = useResizableChatPanel({
    rootRef: workbenchRef,
    componentLibraryOpen: activeSidePanel === "components",
    workspaceExplorerOpen: activeSidePanel === "explorer" || activeSidePanel === "resources"
  });

  const [appError, setAppError] = useState("");
  const [metadata, setMetadata] = useState<AppMetadata>(FALLBACK_APP_METADATA);
  const bridge = resolveArchAgentApi(window.archAgent);
  const activePreviewKey = preview ? getPreviewKey(preview) : "";

  useEffect(() => {
    // 切换预览文件时重置未保存状态与 Markdown 编辑模式。
    setPreviewDirty(false);
    setMdEditMode(false);
  }, [activePreviewKey]);

  const closePreview = useCallback((): void => {
    setPreview(undefined);
    setPreviewError("");
    setSelectedArtifactId(undefined);
  }, []);

  const requestBuiltInComponent = useCallback((componentId: BuiltInComponentId): void => {
    closePreview();
    setComponentRequest((current) => ({ componentId, revision: (current?.revision ?? 0) + 1 }));
  }, [closePreview]);

  useEffect(() => {
    document.title = currentProject ? `${currentProject.name} - ${metadata.title}` : metadata.title;
  }, [metadata.title, currentProject?.name]);
  const api = bridge.api;

  const refreshWorkspaceFiles = useCallback(async (): Promise<void> => {
    if (!api || !currentProject) {
      setWorkspaceFiles([]);
      return;
    }
    try {
      setWorkspaceFiles(await api.workspace.listFiles({ projectPath: currentProject.path }));
    } catch (error) {
      setAppError(`读取项目文件失败：${getErrorMessage(error)}`);
    }
  }, [api, currentProject]);

  const previewWorkspaceFile = useCallback(async (file: WorkspaceFileItem): Promise<void> => {
    if (!api || file.kind !== "file") return;
    const kind = getWorkspaceArtifactKind(file.name);
    setSelectedArtifactId(undefined);
    setPreviewError("");
    try {
      if (isWorkspaceImage(file.name)) {
        const binary = await api.file.readBinary({ path: file.path });
        setPreview({
          name: file.name,
          kind,
          mode: "image",
          path: file.path,
          size: binary.size,
          dataUrl: `data:${binary.mimeType || "application/octet-stream"};base64,${binary.dataBase64}`,
          mimeType: binary.mimeType
        });
        return;
      }
      if (isWorkspaceTextFile(file.name)) {
        const text = await api.file.readText({ path: file.path });
        setPreview({ name: file.name, kind, mode: "text", path: file.path, size: text.size, text: text.content });
        return;
      }
      setPreview({
        name: file.name,
        kind,
        mode: "unsupported",
        path: file.path,
        size: file.size,
        summary: "该文件暂不支持内联预览"
      });
    } catch (error) {
      setPreview(undefined);
      setPreviewError(getErrorMessage(error));
    }
  }, [api]);

  useEffect(() => {
    void refreshWorkspaceFiles();
  }, [refreshWorkspaceFiles]);

  useEffect(() => {
    if (!api || !currentProject) return;
    void api.scene.activateProject(currentProject.path).catch((error: unknown) => {
      setAppError(`场景项目加载失败：${getErrorMessage(error)}`);
    });
  }, [api, currentProject?.path]);

  useEffect(() => {
    const initialProject = getInitialProjectFromUrl();
    if (initialProject) {
      dispatch(setCurrentProject(initialProject));
    }
  }, [dispatch]);

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.app
      .getMetadata()
      .then((nextMetadata) => {
        if (active) setMetadata(nextMetadata);
      })
      .catch((error: unknown) => {
        if (active) setAppError(`应用信息加载失败：${getErrorMessage(error)}`);
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("arch-agent-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.setAttribute("data-theme", settings.theme);
    localStorage.setItem("arch-agent-theme", settings.theme);
  }, [settings?.theme]);

  useEffect(() => {
    if (!currentProject || !currentSessionId) return;
    const session = sessions.find((item) => item.id === currentSessionId);
    if (!session || normalizeProjectPath(session.projectPath) !== normalizeProjectPath(currentProject.path)) return;
    localStorage.setItem(getLastSessionStorageKey(currentProject.path), currentSessionId);
  }, [currentProject?.path, currentSessionId, sessions]);

  useEffect(() => {
    if (!api) return;
    let unsubscribe: (() => void) | undefined;
    void bootstrap(dispatch, api, currentProject?.path)
      .catch((error: unknown) => setAppError(`启动初始化失败：${getErrorMessage(error)}`));
    try {
      unsubscribe = api.events.subscribe((event) => {
        dispatch(applyRendererEvent(event));
      });
    } catch (error) {
      setAppError(`事件订阅失败：${getErrorMessage(error)}`);
    }
    return unsubscribe;
  }, [api, dispatch, currentProject?.path]);

  async function openProject(): Promise<void> {
    if (!api) return;
    try {
      const project = await api.project.open();
      if (project) dispatch(setCurrentProject(project));
    } catch (error) {
      setAppError(`打开项目失败：${getErrorMessage(error)}`);
    }
  }

  async function createProject(): Promise<void> {
    if (!api) return;
    try {
      const project = await api.project.create();
      if (project) dispatch(setCurrentProject(project));
    } catch (error) {
      setAppError(`新建项目失败：${getErrorMessage(error)}`);
    }
  }

  const createConversation = useCallback(async (): Promise<void> => {
    if (!api || !currentProject) return;
    try {
      const session = await api.session.create({ projectPath: currentProject.path });
      dispatch(upsertSession(session));
      dispatch(setCurrentSession(session.id));
    } catch (error) {
      setAppError(`新建对话失败：${getErrorMessage(error)}`);
    }
  }, [api, currentProject, dispatch]);

  const renameConversation = useCallback(async (sessionId: string, title: string): Promise<void> => {
    if (!api) return;
    const session = await api.session.rename({ sessionId, title });
    dispatch(upsertSession(session));
  }, [api, dispatch]);

  const deleteConversation = useCallback(async (sessionId: string): Promise<void> => {
    if (!api) return;
    await api.session.delete(sessionId);
    const nextSessions = currentProject ? await api.session.list(currentProject.path) : [];
    dispatch(setSessions(nextSessions));
    dispatch(setArtifacts(await listProjectArtifacts(api, nextSessions)));
  }, [api, currentProject, dispatch]);

  const previewArtifact = useCallback(async (artifactId: string): Promise<void> => {
    if (!api) return;
    setSelectedArtifactId(artifactId);
    setPreviewError("");
    try {
      setPreview(await api.artifact.preview(artifactId));
    } catch (error) {
      setPreview(undefined);
      setPreviewError(getErrorMessage(error));
    }
  }, [api]);

  const savePreviewContent = useCallback(async (path: string, content: string): Promise<void> => {
    if (!api) return;
    await api.file.writeText({ path, content });
    setPreview((current) =>
      current && current.path === path ? { ...current, text: content, size: new Blob([content]).size } : current
    );
  }, [api]);

  const handleAppError = useCallback((message: string): void => setAppError(message), []);
  const handlePreviewArtifact = useCallback((artifactId: string): void => {
    void previewArtifact(artifactId);
  }, [previewArtifact]);
  const toggleMarkdownMode = useCallback((): void => setMdEditMode((value) => !value), []);

  if (!api) {
    return <MissingBridge detail={bridge.error} />;
  }

  if (!currentProject) {
    return (
      <Tooltip.Provider delayDuration={350}>
        <ProjectPicker
          metadata={metadata}
          recentProjects={recentProjects}
          onOpenProject={() => void openProject()}
          onCreateProject={() => void createProject()}
          onSelectProject={(project) => dispatch(setCurrentProject(project))}
          onOpenSettings={() => dispatch(setSettingsOpen(true))}
        />
        {settingsOpen ? (
          <SettingsPanel
            api={api}
            settings={settings}
            onClose={() => dispatch(setSettingsOpen(false))}
            onSaved={(next) => dispatch(setSettings(next))}
            onError={(message) => setAppError(message)}
          />
        ) : null}
        {appError ? <AppNotice message={appError} onClose={() => setAppError("")} /> : null}
      </Tooltip.Provider>
    );
  }

  return (
    <Tooltip.Provider delayDuration={350}>
      <div ref={workbenchRef} className={activeSidePanel === "explorer" || activeSidePanel === "resources" ? "workbench-shell has-resource-explorer" : "workbench-shell"}>
        <ActivityBar
          metadata={metadata}
          hasProject={Boolean(currentProject)}
          onOpenProject={() => void openProject()}
          onCreateProject={() => void createProject()}
          onCloseProject={() => dispatch(setCurrentProject(undefined))}
          onRevealProject={() => void api.file.reveal(currentProject.path).catch((error: unknown) => handleAppError(`打开项目文件夹失败：${getErrorMessage(error)}`))}
          onOpenSettings={() => dispatch(setSettingsOpen(true))}
          activeSection={activeSidePanel}
          onOpenExplorer={() =>
            setActiveSidePanel((current) => (current === "explorer" ? undefined : "explorer"))
          }
          onOpenResources={() =>
            setActiveSidePanel((current) => (current === "resources" ? undefined : "resources"))
          }
          onOpenSceneNavigation={() =>
            setActiveSidePanel((current) => (current === "scene" ? undefined : "scene"))
          }
          onOpenComponentLibrary={() =>
            setActiveSidePanel((current) => (current === "components" ? undefined : "components"))
          }
        />
        {activeSidePanel === "explorer" ? (
          <ResourceExplorer
            api={api}
            project={currentProject}
            files={workspaceFiles}
            selectedFilePath={preview?.path}
            onPreviewFile={(file) => void previewWorkspaceFile(file)}
            onFilesChanged={() => void refreshWorkspaceFiles()}
          />
        ) : null}
        {activeSidePanel === "resources" ? (
          <CurrentResourcesPanel
            api={api}
            artifacts={artifacts.filter((artifact) => artifact.sessionId === currentSessionId)}
            onPreviewArtifact={handlePreviewArtifact}
          />
        ) : null}
        <main className="editor-area">
          <EditorHeader
            preview={preview}
            projectPath={currentProject.path}
            dirty={previewDirty}
            mdEditMode={mdEditMode}
            onToggleMdMode={toggleMarkdownMode}
            onClose={closePreview}
          />
          <EditorWorkspace
            api={api}
            preview={preview}
            previewError={previewError}
            selectedArtifactId={selectedArtifactId}
            theme={settings?.theme ?? "light"}
            mdMode={mdEditMode ? "edit" : "preview"}
            componentRequest={componentRequest}
            sidebarMode={activeSidePanel === "scene" || activeSidePanel === "components" ? activeSidePanel : undefined}
            onSelectBuiltInComponent={requestBuiltInComponent}
            onPreviewArtifact={handlePreviewArtifact}
            onSaveContent={savePreviewContent}
            onDirtyChange={setPreviewDirty}
            onError={handleAppError}
          />
        </main>
        <div
          className="chat-panel-resizer"
          role="separator"
          aria-label="调整对话面板宽度"
          aria-orientation="vertical"
          aria-valuemin={chatPanelResize.minWidth}
          aria-valuemax={chatPanelResize.maxWidth}
          aria-valuenow={chatPanelResize.width}
          aria-valuetext={`${chatPanelResize.width} 像素`}
          tabIndex={0}
          onKeyDown={chatPanelResize.onKeyDown}
          onPointerCancel={chatPanelResize.onPointerCancel}
          onPointerDown={chatPanelResize.onPointerDown}
          onPointerMove={chatPanelResize.onPointerMove}
          onPointerUp={chatPanelResize.onPointerUp}
        />
        <ChatWorkspace
          api={api}
          onCreateConversation={createConversation}
          onPreviewArtifact={handlePreviewArtifact}
          onError={handleAppError}
          onRenameSession={renameConversation}
          onDeleteSession={deleteConversation}
        />
        {settingsOpen ? (
          <SettingsPanel
            api={api}
            settings={settings}
            onClose={() => dispatch(setSettingsOpen(false))}
            onSaved={(next) => dispatch(setSettings(next))}
            onError={(message) => setAppError(message)}
          />
        ) : null}
        {appError ? <AppNotice message={appError} onClose={() => setAppError("")} /> : null}
      </div>
    </Tooltip.Provider>
  );
}

function MissingBridge({ detail }: { detail?: string }): JSX.Element {
  return (
    <div className="bridge-missing">
      <strong>Electron 预加载桥未就绪</strong>
      <span>{detail || "请通过 `npm run dev` 或打包后的 Electron 应用启动，不要直接在浏览器打开渲染页。"}</span>
      <small>如果仍然出现该提示，请重启开发服务；preload 会注入 `window.archAgent`。</small>
    </div>
  );
}

function AppNotice({ message, onClose }: { message: string; onClose: () => void }): JSX.Element {
  return (
    <div className="app-notice" role="status">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="关闭提示">
        <X size={14} />
      </button>
    </div>
  );
}

async function bootstrap(
  dispatch: AppDispatch,
  api: ArchAgentApi,
  projectPath: string | undefined
): Promise<void> {
  const [settings, sessions, recentProjects] = await Promise.all([
    api.settings.get(),
    projectPath ? api.session.list(projectPath) : Promise.resolve([]),
    api.app.recentProjects()
  ]);
  const artifacts = await listProjectArtifacts(api, sessions);
  const lastSessionId = projectPath ? localStorage.getItem(getLastSessionStorageKey(projectPath)) : undefined;
  if (lastSessionId && sessions.some((session) => session.id === lastSessionId)) {
    dispatch(setCurrentSession(lastSessionId));
  }
  dispatch(setSessions(sessions));
  dispatch(setSettings(settings));
  dispatch(setArtifacts(artifacts));
  dispatch(setRecentProjects(recentProjects));
  if (sessions.length === 0 && projectPath) {
    const session = await api.session.create({ projectPath });
    dispatch(upsertSession(session));
    dispatch(setCurrentSession(session.id));
  }
}

function getLastSessionStorageKey(projectPath: string): string {
  return `arch-agent:last-session:${normalizeProjectPath(projectPath)}`;
}

function normalizeProjectPath(projectPath: string): string {
  return projectPath.replace(/\\/g, "/").toLowerCase();
}

function getWorkspaceArtifactKind(name: string): ArtifactKind {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (["docx", "pdf", "png", "jpg", "jpeg", "webp", "svg", "json", "md", "txt", "log", "stl", "obj", "glb", "gltf", "3mf", "step", "iges", "dxf"].includes(extension)) {
    return extension as ArtifactKind;
  }
  return "other";
}

function isWorkspaceImage(name: string): boolean {
  return ["png", "jpg", "jpeg", "webp", "svg", "gif", "bmp"].includes(name.split(".").at(-1)?.toLowerCase() || "");
}

function isWorkspaceTextFile(name: string): boolean {
  const extension = name.split(".").at(-1)?.toLowerCase() || "";
  return ["txt", "md", "markdown", "json", "jsonc", "log", "js", "jsx", "ts", "tsx", "py", "css", "scss", "html", "xml", "yaml", "yml", "toml", "ini", "env", "sh", "ps1", "sql"].includes(extension);
}

async function listProjectArtifacts(api: ArchAgentApi, sessions: ChatSession[]): Promise<ArtifactSummary[]> {
  const artifacts = await api.artifact.list();
  const sessionIds = new Set(sessions.map((session) => session.id));
  return artifacts.filter((artifact) => !artifact.sessionId || sessionIds.has(artifact.sessionId));
}
