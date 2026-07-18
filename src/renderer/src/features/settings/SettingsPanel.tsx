/** Runtime, model-provider, appearance, and output settings dialog. */
import { useState, type JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bot,
  Check,
  Image,
  Loader2,
  Moon,
  Palette,
  Play,
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
  const [baseUrl, setBaseUrl] = useState(settings?.openai.baseUrl || "https://api.openai.com/v1");
  const [visionBaseUrl, setVisionBaseUrl] = useState(settings?.openai.visionBaseUrl || "");
  const [chatModel, setChatModel] = useState(settings?.openai.chatModel || "gpt-5.5");
  const [chatImageInputEnabled, setChatImageInputEnabled] = useState(settings?.openai.chatImageInputEnabled ?? false);
  const [visionModel, setVisionModel] = useState(settings?.openai.visionModel || "");
  const [thinkingEnabled, setThinkingEnabled] = useState(settings?.openai.thinkingEnabled ?? true);
  const [reasoningEffort, setReasoningEffort] = useState(settings?.openai.reasoningEffort || "");
  const [autoPdfExport, setAutoPdfExport] = useState(settings?.output.autoPdfExport ?? false);
  const [libreOfficePath, setLibreOfficePath] = useState(settings?.output.libreOfficePath || "");
  const [timeoutSeconds, setTimeoutSeconds] = useState(settings?.openai.requestTimeoutSeconds || 120);
  const [imageRequestTimeoutSeconds, setImageRequestTimeoutSeconds] = useState(settings?.hunyuanImage.requestTimeoutSeconds || 120);
  const [imagePollIntervalSeconds, setImagePollIntervalSeconds] = useState(settings?.hunyuanImage.pollIntervalSeconds || 3);
  const [imageJobTimeoutSeconds, setImageJobTimeoutSeconds] = useState(settings?.hunyuanImage.jobTimeoutSeconds || 900);
  const [imageRegion, setImageRegion] = useState(settings?.hunyuanImage.region || "ap-guangzhou");
  const [imageResolution, setImageResolution] = useState(settings?.hunyuanImage.resolution || "1024:1024");
  const [imageRevise, setImageRevise] = useState(settings?.hunyuanImage.revise ?? true);
  const [imageLogoAdd, setImageLogoAdd] = useState(settings?.hunyuanImage.logoAdd ?? true);
  const [contextWindowTokens, setContextWindowTokens] = useState(
    settings ? clampContextWindowTokens(settings.openai.contextWindowTokens) : CONTEXT_WINDOW_TOKENS_DEFAULT
  );
  const [maxTokens, setMaxTokens] = useState(settings?.openai.maxOutputTokens || 16000);
  const [execBashEnabled, setExecBashEnabled] = useState(settings?.agent.execBashEnabled ?? true);
  const [apiKey, setApiKey] = useState("");
  const [imageSecretId, setImageSecretId] = useState("");
  const [imageSecretKey, setImageSecretKey] = useState("");
  const [visionApiKey, setVisionApiKey] = useState("");
  const [runtimeCheck, setRuntimeCheck] = useState<RuntimeCheckResult | undefined>();
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(settings?.theme || "light");

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const next = await api.settings.save({
        theme,
        openai: {
          baseUrl,
          visionBaseUrl,
          chatModel,
          chatImageInputEnabled,
          visionModel,
          thinkingEnabled,
          reasoningEffort,
          requestTimeoutSeconds: timeoutSeconds,
          contextWindowTokens: clampContextWindowTokens(contextWindowTokens),
          maxOutputTokens: maxTokens,
          apiKey: apiKey.trim() || undefined,
          visionApiKey: visionApiKey.trim() || undefined
        },
        hunyuanImage: {
          region: imageRegion,
          resolution: imageResolution,
          revise: imageRevise,
          logoAdd: imageLogoAdd,
          requestTimeoutSeconds: imageRequestTimeoutSeconds,
          pollIntervalSeconds: imagePollIntervalSeconds,
          jobTimeoutSeconds: imageJobTimeoutSeconds,
          secretId: imageSecretId.trim() || undefined,
          secretKey: imageSecretKey.trim() || undefined
        },
        output: {
          autoPdfExport,
          libreOfficePath
        },
        agent: {
          execBashEnabled
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
                    混元生图 SecretId
                    <input
                      value={imageSecretId}
                      onChange={(event) => setImageSecretId(event.target.value)}
                      placeholder={settings?.hunyuanImage.secretIdConfigured ? "已配置，留空保持不变" : "腾讯云 SecretId"}
                    />
                  </label>
                  <label>
                    混元生图 SecretKey
                    <input
                      type="password"
                      value={imageSecretKey}
                      onChange={(event) => setImageSecretKey(event.target.value)}
                      placeholder={settings?.hunyuanImage.secretKeyConfigured ? "已配置，留空保持不变" : "腾讯云 SecretKey"}
                    />
                  </label>
                  <label>
                    识图 API Key
                    <input
                      value={visionApiKey}
                      onChange={(event) => setVisionApiKey(event.target.value)}
                      placeholder={settings?.openai.visionApiKeyConfigured ? "已配置，留空保持不变" : "留空沿用 API Key"}
                    />
                  </label>
                  <label>
                    Base URL
                    <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                  </label>
                  <label>
                    识图 Base URL
                    <input
                      value={visionBaseUrl}
                      onChange={(event) => setVisionBaseUrl(event.target.value)}
                      placeholder="留空沿用 Base URL"
                    />
                  </label>
                  <label>
                    Chat 模型
                    <input value={chatModel} onChange={(event) => setChatModel(event.target.value)} />
                  </label>
                  <SwitchRow checked={chatImageInputEnabled} onCheckedChange={setChatImageInputEnabled}>
                    Chat 模型支持图片输入
                  </SwitchRow>
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
                  <label>
                    识图模型
                    <input
                      value={visionModel}
                      onChange={(event) => setVisionModel(event.target.value)}
                      placeholder="留空沿用 Chat 模型"
                    />
                  </label>
                  <label>
                    混元生图地域
                    <input value={imageRegion} onChange={(event) => setImageRegion(event.target.value)} placeholder="ap-guangzhou" />
                  </label>
                  <label>
                    混元生图分辨率
                    <input value={imageResolution} onChange={(event) => setImageResolution(event.target.value)} placeholder="1024:1024" />
                  </label>
                  <SwitchRow checked={imageRevise} onCheckedChange={setImageRevise}>
                    混元生图启用提示词改写
                  </SwitchRow>
                  <SwitchRow checked={imageLogoAdd} onCheckedChange={setImageLogoAdd}>
                    混元生图添加 AI 标识
                  </SwitchRow>
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
                    混元生图轮询间隔（秒）
                    <input type="number" min={1} step={1} value={imagePollIntervalSeconds} onChange={(event) => setImagePollIntervalSeconds(Number(event.target.value))} />
                  </label>
                  <label>
                    混元生图任务最长等待（秒）
                    <input type="number" min={30} step={1} value={imageJobTimeoutSeconds} onChange={(event) => setImageJobTimeoutSeconds(Number(event.target.value))} />
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
              <button type="button" className="secondary-action" onClick={onClose} disabled={saving}>
                取消
              </button>
              <button type="button" className="send-action" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : null}
                保存
              </button>
            </div>
          </footer>
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
