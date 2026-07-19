/** Defines the framework-neutral Agent runtime contract used by the Electron host. */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { AppSettings, ArtifactSummary, AttachmentRef, ChatSession, SessionResource, StreamItem } from "../../shared/types";
import type { SceneCommandInput, SceneCommandResult, SceneSnapshot } from "../../shared/modeling3d/sceneContracts";
import type { BundledPythonRuntime } from "../runtime/bundledRuntime";
import type { CreateReconstructionWorkflowInput } from "./reconstructionWorkflowService";
import type { ReconstructionWorkflow } from "../../shared/types";
import { createPiAgentBridge } from "./piAgentBridge";

export type MessageStreamItem = Extract<StreamItem, { kind: "message" }>;
export type ScenePreviewView = "current" | "perspective" | "top" | "front" | "right" | "left" | "back" | "bottom";

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
  getSessionAttachments(sessionId: string): AttachmentRef[];
  getSessionArtifacts(sessionId: string): ArtifactSummary[];
  getSessionResources(sessionId: string): SessionResource[];
  getBundledPythonRuntime(): BundledPythonRuntime | undefined;
  getSceneSnapshot(): SceneSnapshot;
  captureScenePreview(view?: ScenePreviewView): Promise<string>;
  executeSceneCommand(command: SceneCommandInput): SceneCommandResult;
  placeComponentLibraryItem(input: {
    componentId: string;
    name?: string;
    parentId?: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    targetDimensions?: [number, number, number];
    footprint?: [number, number];
  }): SceneCommandResult;
  createReconstructionWorkflow(sessionId: string, input: CreateReconstructionWorkflowInput): ReconstructionWorkflow;
  createArtifact(sessionId: string, filePath: string, parentResourceIds?: string[]): ArtifactSummary;
  sendArtifact(sessionId: string, resourceId: string): ArtifactSummary;
}

export function createAgentRuntime(host: AgentRuntimeHost): AgentRuntime {
  return createPiAgentBridge(host);
}
