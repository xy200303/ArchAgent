/** Runtime, model-provider, appearance, and output settings dialog. */
import { useState, type JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bot,
  Box,
  Check,
  Image,
  Loader2,
  Moon,
  Palette,
  Play,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sun,
  X
} from "lucide-react";
import {
  CONTEXT_WINDOW_TOKENS_DEFAULT,
  CONTEXT_WINDOW_TOKENS_MAX,
  CONTEXT_WINDOW_TOKENS_MIN,
  clampContextWindowTokens,
  type AppSettings,
  type ArchAgentApi,
  type RuntimeCheckResult,
  type RuntimeCommandCheck
} from "../../../../shared/types";
import { getErrorMessage } from "../../platform/bridge";
import { formatDateTime, runtimeSourceLabel } from "../../shared/presentation";

function ThemeToggle({
  theme,
  onChange
}: {
  theme: "light" | "dark";
  onChange: (theme: "light" | "dark") => void;
}): JSX.Element {
  return (
    <div className="theme-toggle">
      <button
        type="button"
        className={theme === "light" ? "active" : ""}
        onClick={() => onChange("light")}
        aria-label="浅色主题"
      >
        <Sun size={16} />
        浅色
      </button>
      <button
        type="button"
        className={theme === "dark" ? "active" : ""}
        onClick={() => onChange("dark")}
        aria-label="深色主题"
      >
        <Moon size={16} />
        深色
      </button>
    </div>
  );
}

export function SettingsPanel({
  api,
  settings,
  onClose,
  onSaved,
  onError
}: {
  api: ArchAgentApi;
  settings?: AppSettings;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const [baseUrl, setBaseUrl] = useState(settings?.openai.baseUrl || "https://tokenhub.tencentmaas.com/v1");
  const [chatModel, setChatModel] = useState(settings?.openai.chatModel || "hy3-preview");
  const [thinkingEnabled, setThinkingEnabled] = useState(settings?.openai.thinkingEnabled ?? true);
  const [reasoningEffort, setReasoningEffort] = useState(settings?.openai.reasoningEffort || "");
  const [autoPdfExport, setAutoPdfExport] = useState(settings?.output.autoPdfExport ?? false);
  const [libreOfficePath, setLibreOfficePath] = useState(settings?.output.libreOfficePath || "");
  const [timeoutSeconds, setTimeoutSeconds] = useState(settings?.openai.requestTimeoutSeconds || 120);
  const [imageRequestTimeoutSeconds, setImageRequestTimeoutSeconds] = useState(settings?.tokenHubImage.requestTimeoutSeconds || 300);
  const [imageEndpoint, setImageEndpoint] = useState(settings?.tokenHubImage.endpoint || "https://tokenhub.tencentmaas.com/v1/api/image/lite");
  const [imageModel, setImageModel] = useState(settings?.tokenHubImage.model || "hy-image-v3.0");
  const [threeDSubmitEndpoint, setThreeDSubmitEndpoint] = useState(settings?.tokenHub3d.submitEndpoint || "https://tokenhub.tencentmaas.com/v1/api/3d/submit");
  const [threeDQueryEndpoint, setThreeDQueryEndpoint] = useState(settings?.tokenHub3d.queryEndpoint || "https://tokenhub.tencentmaas.com/v1/api/3d/query");
  const [threeDModel, setThreeDModel] = useState(settings?.tokenHub3d.model || "hy-3d-3.0");
  const [threeDFaceCount, setThreeDFaceCount] = useState(settings?.tokenHub3d.faceCount || 50000);
  const [threeDSubmitTimeoutSeconds, setThreeDSubmitTimeoutSeconds] = useState(settings?.tokenHub3d.submitTimeoutSeconds || 120);
  const [threeDPollIntervalSeconds, setThreeDPollIntervalSeconds] = useState(settings?.tokenHub3d.pollIntervalSeconds || 3);
  const [threeDJobTimeoutSeconds, setThreeDJobTimeoutSeconds] = useState(settings?.tokenHub3d.jobTimeoutSeconds || 900);
  const [contextWindowTokens, setContextWindowTokens] = useState(
    settings ? clampContextWindowTokens(settings.openai.contextWindowTokens) : CONTEXT_WINDOW_TOKENS_DEFAULT
  );
  const [maxTokens, setMaxTokens] = useState(settings?.openai.maxOutputTokens || 16000);
  const [execBashEnabled, setExecBashEnabled] = useState(settings?.agent.execBashEnabled ?? true);
  const [scriptTimeoutSeconds, setScriptTimeoutSeconds] = useState(settings?.agent.scriptTimeoutSeconds || 60);
  const [apiKey, setApiKey] = useState("");
  const [runtimeCheck, setRuntimeCheck] = useState<RuntimeCheckResult | undefined>();
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(settings?.theme || "light");

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const next = await api.settings.save({
        theme,
        openai: {
          baseUrl,
          chatModel,
          thinkingEnabled,
          reasoningEffort,
          requestTimeoutSeconds: timeoutSeconds,
          contextWindowTokens: clampContextWindowTokens(contextWindowTokens),
          maxOutputTokens: maxTokens,
          apiKey: apiKey.trim() || undefined,
        },
        tokenHubImage: {
          endpoint: imageEndpoint,
          model: imageModel,
          requestTimeoutSeconds: imageRequestTimeoutSeconds,
        },
        tokenHub3d: {
          submitEndpoint: threeDSubmitEndpoint,
          queryEndpoint: threeDQueryEndpoint,
          model: threeDModel,
          faceCount: threeDFaceCount,
          submitTimeoutSeconds: threeDSubmitTimeoutSeconds,
          pollIntervalSeconds: threeDPollIntervalSeconds,
          jobTimeoutSeconds: threeDJobTimeoutSeconds
        },
        output: {
          autoPdfExport,
          libreOfficePath
        },
        agent: {
          execBashEnabled,
          scriptTimeoutSeconds
        }
      });
      onSaved(next);
      onClose();
    } catch (error) {
      onError(`保存设置失败：${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function runRuntimeCheck(): Promise<void> {
    setCheckingRuntime(true);
    try {
      setRuntimeCheck(await api.settings.checkRuntime());
    } catch (error) {
      onError(`运行时自检失败：${getErrorMessage(error)}`);
    } finally {
      setCheckingRuntime(false);
    }
  }

  async function resetToDefaults(): Promise<void> {
    setResetting(true);
    try {
      const next = await api.settings.reset();
      onSaved(next);
      onClose();
    } catch (error) {
      onError(`恢复默认配置失败：${getErrorMessage(error)}`);
    } finally {
      setResetting(false);
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
        <Dialog.Overlay className="settings-backdrop settings-panel-backdrop" />
        <Dialog.Content className="settings-panel">
          <header>
            <div className="settings-title">
              <Dialog.Title asChild>
                <h2>运行设置</h2>
              </Dialog.Title>
              <span className="settings-subtitle">Hy3 模型、3D 渲染与空间设计工具</span>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="关闭设置">
                <X size={16} />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">配置模型、外观、输出与高级运行参数。</Dialog.Description>
          <Tabs.Root className="settings-tabs" defaultValue="model">
            <Tabs.List className="tabs-list" aria-label="设置分组">
              <Tabs.Trigger className="tabs-trigger" value="model">
                <Bot size={16} />
                模型
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="3d">
                <Box size={16} />
                3D
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="appearance">
                <Palette size={16} />
                外观
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="output">
                <Image size={16} />
                输出
              </Tabs.Trigger>
              <Tabs.Trigger className="tabs-trigger" value="advanced">
                <SlidersHorizontal size={16} />
                高级
              </Tabs.Trigger>
            </Tabs.List>
            <ScrollArea.Root className="settings-scroll">
              <ScrollArea.Viewport className="settings-viewport">
                <Tabs.Content className="settings-form settings-form-model" value="model">
                  <label>
                    API Key
                    <input
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={settings?.openai.apiKeyConfigured ? "已配置，留空保持不变" : "TokenHub / Hy3 API Key"}
                    />
                  </label>
                  <label>
                    TokenHub 生图端点
                    <input
                      value={imageEndpoint}
                      onChange={(event) => setImageEndpoint(event.target.value)}
                    />
                  </label>
                  <label>
                    TokenHub 生图模型
                    <input
                      value={imageModel}
                      onChange={(event) => setImageModel(event.target.value)}
                      placeholder="hy-image-v3.0"
                    />
                  </label>
                  <label>
                    Base URL
                    <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                  </label>
                  <label>
                    Chat 模型
                    <input value={chatModel} onChange={(event) => setChatModel(event.target.value)} />
                  </label>
                  <SwitchRow checked={thinkingEnabled} onCheckedChange={setThinkingEnabled}>
                    启用模型思考模式
                  </SwitchRow>
                  <label>
                    推理强度
                    <select value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)}>
                      <option value="">默认</option>
                      <option value="none">none（关闭）</option>
                      <option value="minimal">minimal</option>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="xhigh">xhigh</option>
                    </select>
                  </label>
                </Tabs.Content>

                <Tabs.Content className="settings-form settings-form-3d" value="3d">
                  <label>
                    TokenHub 3D 提交端点
                    <input value={threeDSubmitEndpoint} onChange={(event) => setThreeDSubmitEndpoint(event.target.value)} />
                  </label>
                  <label>
                    TokenHub 3D 查询端点
                    <input value={threeDQueryEndpoint} onChange={(event) => setThreeDQueryEndpoint(event.target.value)} />
                  </label>
                  <label>
                    TokenHub 3D 模型
                    <input value={threeDModel} onChange={(event) => setThreeDModel(event.target.value)} placeholder="hy-3d-3.0" />
                  </label>
                  <label>
                    普通细节面数
                    <input type="number" min={3000} max={150000} step={1000} value={threeDFaceCount} onChange={(event) => setThreeDFaceCount(Number(event.target.value))} />
                  </label>
                  <label>
                    提交请求超时（秒）
                    <input type="number" min={1} step={1} value={threeDSubmitTimeoutSeconds} onChange={(event) => setThreeDSubmitTimeoutSeconds(Number(event.target.value))} />
                  </label>
                  <label>
                    任务轮询间隔（秒）
                    <input type="number" min={1} step={1} value={threeDPollIntervalSeconds} onChange={(event) => setThreeDPollIntervalSeconds(Number(event.target.value))} />
                  </label>
                  <label>
                    任务最大等待（秒）
                    <input type="number" min={1} step={1} value={threeDJobTimeoutSeconds} onChange={(event) => setThreeDJobTimeoutSeconds(Number(event.target.value))} />
                  </label>
                </Tabs.Content>

                <Tabs.Content className="settings-form" value="appearance">
                  <div className="settings-section">
                    <span className="settings-section-label">主题</span>
                    <ThemeToggle theme={theme} onChange={setTheme} />
                  </div>
                </Tabs.Content>

                <Tabs.Content className="settings-form" value="output">
                  <SwitchRow checked={autoPdfExport} onCheckedChange={setAutoPdfExport}>
                    分析报告生成后自动导出 PDF
                  </SwitchRow>
                  <label>
                    LibreOffice 路径
                    <input
                      value={libreOfficePath}
                      onChange={(event) => setLibreOfficePath(event.target.value)}
                      placeholder="留空自动查找 soffice/libreoffice"
                    />
                  </label>
                </Tabs.Content>

                <Tabs.Content className="settings-form" value="advanced">
                  <label>
                    Agent 引擎
                    <input value="内置 @mariozechner/pi-coding-agent" readOnly />
                  </label>
                  <RuntimeStatusPanel settings={settings} check={runtimeCheck} />
                  <div className="runtime-check-actions">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => void runRuntimeCheck()}
                      disabled={checkingRuntime}
                    >
                      {checkingRuntime ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                      运行 Python 自检
                    </button>
                  </div>
                  <label>
                    请求超时（秒）
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={timeoutSeconds}
                      onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    混元生图请求超时（秒）
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={imageRequestTimeoutSeconds}
                      onChange={(event) => setImageRequestTimeoutSeconds(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    上下文窗口 tokens
                    <input
                      type="number"
                      min={CONTEXT_WINDOW_TOKENS_MIN}
                      max={CONTEXT_WINDOW_TOKENS_MAX}
                      step={1024}
                      value={contextWindowTokens}
                      onChange={(event) => setContextWindowTokens(clampContextWindowTokens(event.target.value))}
                    />
                  </label>
                  <label>
                    最大输出 tokens
                    <input
                      type="number"
                      value={maxTokens}
                      onChange={(event) => setMaxTokens(Number(event.target.value))}
                    />
                  </label>
                  <SwitchRow checked={execBashEnabled} onCheckedChange={setExecBashEnabled}>
                    允许 Agent 使用 exec_bash 执行命令
                  </SwitchRow>
                  <label>
                    外部脚本最长执行时间（秒）
                    <input
                      type="number"
                      min={1}
                      max={600}
                      step={1}
                      value={scriptTimeoutSeconds}
                      onChange={(event) => setScriptTimeoutSeconds(Number(event.target.value))}
                    />
                  </label>
                </Tabs.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
                <ScrollArea.Thumb className="scrollbar-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </Tabs.Root>
          <footer>
            <span className="settings-env-path" title={settings?.runtime.envFilePath || ".env.local"}>
              {settings?.runtime.envFilePath || ".env.local"}
            </span>
            <div className="settings-footer-actions">
              <button type="button" className="secondary-action" onClick={() => setResetConfirmationOpen(true)} disabled={saving || resetting}>
                <RotateCcw size={14} />
                恢复默认
              </button>
              <button type="button" className="secondary-action" onClick={onClose} disabled={saving}>
                取消
              </button>
              <button type="button" className="send-action" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : null}
                保存
              </button>
            </div>
          </footer>
          <AlertDialog.Root open={resetConfirmationOpen} onOpenChange={(open) => { if (!resetting) setResetConfirmationOpen(open); }}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="modal-backdrop" />
              <AlertDialog.Content className="modal-panel delete-panel">
                <AlertDialog.Title>恢复默认配置？</AlertDialog.Title>
                <AlertDialog.Description>将覆盖当前 `.env.local` 中的所有设置，并清空 API Key。此操作无法撤销。</AlertDialog.Description>
                <footer>
                  <AlertDialog.Cancel asChild>
                    <button type="button" className="secondary-action" disabled={resetting}>取消</button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button type="button" className="danger-action" disabled={resetting} onClick={(event) => { event.preventDefault(); void resetToDefaults(); }}>
                      {resetting ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
                      恢复默认
                    </button>
                  </AlertDialog.Action>
                </footer>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RuntimeStatusPanel({
  settings,
  check
}: {
  settings?: AppSettings;
  check?: RuntimeCheckResult;
}): JSX.Element {
  const bundledPython = settings?.runtime.bundledPython;
  const available = bundledPython?.available ?? false;

  return (
    <div className={`runtime-status ${available ? "available" : "missing"}`}>
      <div>
        <strong>{available ? "内置 Python 已启用" : "未发现内置 Python"}</strong>
        <span>
          {available
            ? `${runtimeSourceLabel(bundledPython?.source)} · exec_bash 会优先使用随包 Python`
            : "exec_bash 将回退到用户系统 PATH 中的 Python"}
        </span>
      </div>
      {available ? <code title={bundledPython?.pythonExePath}>{bundledPython?.pythonExePath}</code> : null}
      {check ? (
        <div className="runtime-check-result">
          <RuntimeCommandLine label="Python" check={check.python} />
          <RuntimeCommandLine label="pip" check={check.pip} />
          <small>检测时间：{formatDateTime(check.checkedAt)}</small>
        </div>
      ) : null}
    </div>
  );
}

function RuntimeCommandLine({ label, check }: { label: string; check: RuntimeCommandCheck }): JSX.Element {
  return (
    <div className={`runtime-command-line ${check.ok ? "ok" : "failed"}`}>
      <span>{label}</span>
      <strong>{check.ok ? "可用" : "失败"}</strong>
      <code title={check.output || check.error}>{check.output || check.error}</code>
    </div>
  );
}

function SwitchRow({
  checked,
  onCheckedChange,
  children
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: string;
}): JSX.Element {
  return (
    <div className="switch-row">
      <span>{children}</span>
      <Switch.Root className="switch-control" checked={checked} onCheckedChange={onCheckedChange} aria-label={children}>
        <Switch.Thumb className="switch-thumb" />
      </Switch.Root>
    </div>
  );
}
