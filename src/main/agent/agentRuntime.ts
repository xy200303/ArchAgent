/** Defines the framework-neutral Agent runtime contract used by the Electron host. */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { AppSettings, ChatSession, StreamItem } from "../../shared/types";
import type { SceneCommandInput, SceneCommandResult, SceneSnapshot } from "../../shared/modeling3d/sceneContracts";
import type { BundledPythonRuntime } from "../runtime/bundledRuntime";
import { createPiAgentBridge } from "./piAgentBridge";

export type MessageStreamItem = Extract<StreamItem, { kind: "message" }>;

export interface AgentRuntimeTurnInput {
  sessionId: string;
  userPrompt: string;
  images?: ImageContent[];
  controller: AbortController;
  onAssistantCreated: (assistantItem: MessageStreamItem) => void;
}

export interface AgentRuntime {
  runTurn(input: AgentRuntimeTurnInput): Promise<MessageStreamItem>;
  disposeSession(sessionId: string): void;
  dispose(): void;
}

export interface AgentRuntimeHost {
  rootDir: string;
  getSessionRootDir(sessionId: string): string;
  docsDir: string;
  inputDir: string;
  outputDir: string;
  getSessionInputDir(sessionId: string): string;
  getSessionOutputDir(sessionId: string): string;
  loadSettings(): AppSettings;
  getSession(sessionId: string): ChatSession | undefined;
  buildMessages(session: ChatSession): ChatCompletionMessageParam[];
  createAssistantMessage(sessionId: string): MessageStreamItem;
  updateItem(sessionId: string, item: StreamItem): void;
  startToolCall(sessionId: string, toolName: string, summary: string): StreamItem;
  finishToolCall(sessionId: string, item: StreamItem, status: "success" | "failed", summary: string): void;
  addStage(sessionId: string, title: string, detail?: string): void;
  appendSessionMemory(sessionId: string, source: string, content: string): void;
  formatSessionMemory(sessionId: string): string;
  getSessionReadableFiles(sessionId: string): string[];
  getBundledPythonRuntime(): BundledPythonRuntime | undefined;
  getSceneSnapshot(): SceneSnapshot;
  executeSceneCommand(command: SceneCommandInput): SceneCommandResult;
  createArtifact(sessionId: string, filePath: string): void;
}

export function createAgentRuntime(host: AgentRuntimeHost): AgentRuntime {
  return createPiAgentBridge(host);
}
