/** Composes the renderer shell and coordinates state across domain features. */
import { useEffect, useState, type JSX } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { ActivityBar } from "./ActivityBar";
import {
  addAttachments,
  applyRendererEvent,
  clearComposer,
  removeAttachment,
  setArtifacts,
  setArtifactsOpen,
  setComposer,
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
import type { AppMetadata, ArtifactSummary, ArchAgentApi, ChatSession } from "../../../shared/types";
import { Composer } from "../features/chat/Composer";
import { ChatPanelHeader } from "../features/chat/ChatPanelHeader";
import {
  ArtifactHistoryPanel,
  DeleteSessionDialog,
  RenameSessionDialog
} from "../features/chat/ChatDialogs";
import { MessagePane } from "../features/chat/MessagePane";
import {
  EditorHeader,
  EditorWorkspace,
  getPreviewKey,
  type PreviewContent
} from "../features/files/EditorWorkspace";
import { ProjectPicker } from "../features/projects/ProjectPicker";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { getErrorMessage, resolveArchAgentApi } from "../platform/bridge";
import { getInitialProjectFromUrl } from "../shared/presentation";

export function App(): JSX.Element {
  const dispatch = useDispatch<AppDispatch>();
  const {
    sessions,
    artifacts,
    currentSessionId,
    composer,
    pendingAttachments,
    settings,
    settingsOpen,
    artifactsOpen,
    currentProject,
    recentProjects
  } = useSelector(
    (state: RootState) => state.chat
  );
  const [preview, setPreview] = useState<PreviewContent | undefined>();
  const [previewError, setPreviewError] = useState("");
  const [previewDirty, setPreviewDirty] = useState(false);
  const [mdEditMode, setMdEditMode] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | undefined>();

  const [appError, setAppError] = useState("");
  const [metadata, setMetadata] = useState<AppMetadata>(FALLBACK_APP_METADATA);
  const [renameTarget, setRenameTarget] = useState<ChatSession | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | undefined>();
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const bridge = resolveArchAgentApi(window.archAgent);
  const activePreviewKey = preview ? getPreviewKey(preview) : "";

  useEffect(() => {
    // 切换预览文件时重置未保存状态与 Markdown 编辑模式。
    setPreviewDirty(false);
    setMdEditMode(false);
  }, [activePreviewKey]);

  function closePreview(): void {
    setPreview(undefined);
    setPreviewError("");
    setSelectedArtifactId(undefined);
  }

  useEffect(() => {
    document.title = currentProject ? `${currentProject.name} - ${metadata.title}` : metadata.title;
  }, [metadata.title, currentProject?.name]);
  const api = bridge.api;

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

  async function createConversation(): Promise<void> {
    if (!api || !currentProject) return;
    try {
      const session = await api.session.create({ projectPath: currentProject.path });
      dispatch(upsertSession(session));
      dispatch(setCurrentSession(session.id));
    } catch (error) {
      setAppError(`新建对话失败：${getErrorMessage(error)}`);
    }
  }

  async function renameConversation(sessionId: string, title: string): Promise<void> {
    if (!api) return;
    const session = await api.session.rename({ sessionId, title });
    dispatch(upsertSession(session));
  }

  async function deleteConversation(sessionId: string): Promise<void> {
    if (!api) return;
    await api.session.delete(sessionId);
    const nextSessions = currentProject ? await api.session.list(currentProject.path) : [];
    dispatch(setSessions(nextSessions));
    dispatch(setArtifacts(await listProjectArtifacts(api, nextSessions)));
  }

  async function previewArtifact(artifactId: string): Promise<void> {
    if (!api) return;
    setSelectedArtifactId(artifactId);
    setPreviewError("");
    try {
      setPreview(await api.artifact.preview(artifactId));
    } catch (error) {
      setPreview(undefined);
      setPreviewError(getErrorMessage(error));
    }
  }

  async function openArtifactHistory(): Promise<void> {
    if (!api) return;
    dispatch(setArtifacts(await listProjectArtifacts(api, sessions)));
    dispatch(setArtifactsOpen(true));
  }

  async function savePreviewContent(path: string, content: string): Promise<void> {
    if (!api) return;
    await api.file.writeText({ path, content });
    setPreview((current) =>
      current && current.path === path ? { ...current, text: content, size: new Blob([content]).size } : current
    );
  }

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
      <div className="workbench-shell">
        <ActivityBar
          metadata={metadata}
          artifactCount={artifacts.length}
          hasProject={Boolean(currentProject)}
          onCreateConversation={createConversation}
          onOpenProject={() => void openProject()}
          onCreateProject={() => void createProject()}
          onCloseProject={() => dispatch(setCurrentProject(undefined))}
          onOpenArtifacts={() => void openArtifactHistory()}
          onOpenSettings={() => dispatch(setSettingsOpen(true))}
        />
        <main className="editor-area">
          <EditorHeader
            preview={preview}
            projectPath={currentProject.path}
            dirty={previewDirty}
            mdEditMode={mdEditMode}
            onToggleMdMode={() => setMdEditMode((value) => !value)}
            onClose={closePreview}
          />
          <EditorWorkspace
            api={api}
            preview={preview}
            previewError={previewError}
            artifacts={artifacts}
            selectedArtifactId={selectedArtifactId}
            theme={settings?.theme ?? "light"}
            mdMode={mdEditMode ? "edit" : "preview"}
            onPreviewArtifact={(artifactId) => void previewArtifact(artifactId)}
            onSaveContent={(path, content) => savePreviewContent(path, content)}
            onDirtyChange={setPreviewDirty}
            onError={(message) => setAppError(message)}
          />
        </main>
        <aside className="chat-panel">
          <ChatPanelHeader
            sessions={sessions}
            currentSession={currentSession}
            currentSessionId={currentSessionId}
            settings={settings}
            onCreateConversation={createConversation}
            onSelectSession={(sessionId) => dispatch(setCurrentSession(sessionId))}
            onRenameSession={(session) => setRenameTarget(session)}
            onDeleteSession={(session) => setDeleteTarget(session)}
          />
          <MessagePane
            api={api}
            session={currentSession}
            onPreviewArtifact={(artifactId) => void previewArtifact(artifactId)}
            onError={(message) => setAppError(message)}
          />
          <Composer
            api={api}
            session={currentSession}
            value={composer}
            attachments={pendingAttachments}
            onChange={(value) => dispatch(setComposer(value))}
            onAddAttachments={(items) => dispatch(addAttachments({ attachments: items }))}
            onRemoveAttachment={(id) => {
              dispatch(removeAttachment(id));
              void api.attachment.remove(id);
            }}
            onSent={(sessionId) => dispatch(clearComposer(sessionId))}
            onError={(message) => setAppError(message)}
          />
        </aside>
        {settingsOpen ? (
          <SettingsPanel
            api={api}
            settings={settings}
            onClose={() => dispatch(setSettingsOpen(false))}
            onSaved={(next) => dispatch(setSettings(next))}
            onError={(message) => setAppError(message)}
          />
        ) : null}
        {artifactsOpen ? (
          <ArtifactHistoryPanel
            artifacts={artifacts}
            sessions={sessions}
            onClose={() => dispatch(setArtifactsOpen(false))}
            api={api}
            onError={(message) => setAppError(message)}
            onPreviewArtifact={(artifactId) => {
              dispatch(setArtifactsOpen(false));
              void previewArtifact(artifactId);
            }}
          />
        ) : null}
        {renameTarget ? (
          <RenameSessionDialog
            session={renameTarget}
            onClose={() => setRenameTarget(undefined)}
            onRename={(sessionId, title) => renameConversation(sessionId, title)}
          />
        ) : null}
        {deleteTarget ? (
          <DeleteSessionDialog
            session={deleteTarget}
            onClose={() => setDeleteTarget(undefined)}
            onDelete={(sessionId) => deleteConversation(sessionId)}
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

async function listProjectArtifacts(api: ArchAgentApi, sessions: ChatSession[]): Promise<ArtifactSummary[]> {
  const artifacts = await api.artifact.list();
  const sessionIds = new Set(sessions.map((session) => session.id));
  return artifacts.filter((artifact) => !artifact.sessionId || sessionIds.has(artifact.sessionId));
}
