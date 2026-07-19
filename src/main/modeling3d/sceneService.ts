/** Coordinates the authoritative in-memory scene and broadcasts accepted commands. */
import type { RendererEvent } from "../../shared/types";
import {
  applySceneCommand,
  createDefaultScene
} from "../../shared/modeling3d/sceneReducer";
import type {
  SceneCommand,
  SceneCommandInput,
  SceneCommandResult,
  SceneHistoryResult,
  SceneHistoryState,
  SceneSnapshot
} from "../../shared/modeling3d/sceneContracts";
import { resolve } from "node:path";

export interface SceneService {
  getSnapshot(): SceneSnapshot;
  execute(command: SceneCommandInput): SceneCommandResult;
  executeBatch(commands: SceneCommandInput[]): SceneBatchResult;
  getHistoryState(): SceneHistoryState;
  undo(): SceneHistoryResult;
  redo(): SceneHistoryResult;
  activateProject(projectPath: string): SceneSnapshot;
  getActiveProjectPath(): string | undefined;
  replaceSnapshot(nextSnapshot: SceneSnapshot): SceneSnapshot;
}

export type SceneBatchResult =
  | { accepted: true; snapshot: SceneSnapshot; commands: SceneCommand[] }
  | { accepted: false; snapshot: SceneSnapshot; failedIndex: number; message?: string };

export function createSceneService(options: {
  createId: (prefix: string) => string;
  broadcast: (event: RendererEvent) => void;
  loadProjectSnapshot?: (projectPath: string) => SceneSnapshot | undefined;
  saveProjectSnapshot?: (projectPath: string, snapshot: SceneSnapshot) => void;
}): SceneService {
  let snapshot = createDefaultScene();
  let activeProjectPath: string | undefined;
  const undoStack: SceneSnapshot[] = [];
  const redoStack: SceneSnapshot[] = [];

  function getSnapshot(): SceneSnapshot {
    return snapshot;
  }

  function execute(command: SceneCommandInput): SceneCommandResult {
    const result = applySceneCommand(snapshot, command, options.createId);
    if (!result.accepted) return result;

    undoStack.push(snapshot);
    redoStack.length = 0;
    snapshot = result.snapshot;
    persistActiveProject();
    options.broadcast({
      id: options.createId("event"),
      type: "scene.command.applied",
      payload: result
    });
    return result;
  }

  function executeBatch(commands: SceneCommandInput[]): SceneBatchResult {
    let nextSnapshot = snapshot;
    const acceptedCommands: SceneCommand[] = [];
    for (const [index, command] of commands.entries()) {
      const result = applySceneCommand(nextSnapshot, command, options.createId);
      if (!result.accepted) {
        return { accepted: false, snapshot, failedIndex: index, message: result.message };
      }
      nextSnapshot = result.snapshot;
      acceptedCommands.push(result.command);
    }
    if (!acceptedCommands.length) return { accepted: true, snapshot, commands: [] };

    undoStack.push(snapshot);
    redoStack.length = 0;
    snapshot = { ...nextSnapshot, revision: snapshot.revision + 1 };
    persistActiveProject();
    options.broadcast({ id: options.createId("event"), type: "scene.snapshot.restored", payload: snapshot });
    return { accepted: true, snapshot, commands: acceptedCommands };
  }

  function getHistoryState(): SceneHistoryState {
    return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
  }

  function restore(history: SceneSnapshot[], oppositeHistory: SceneSnapshot[]): SceneHistoryResult {
    const target = history.pop();
    if (!target) return { accepted: false, snapshot, ...getHistoryState() };
    oppositeHistory.push(snapshot);
    snapshot = target;
    options.broadcast({ id: options.createId("event"), type: "scene.snapshot.restored", payload: snapshot });
    return { accepted: true, snapshot, ...getHistoryState() };
  }

  function undo(): SceneHistoryResult {
    return restore(undoStack, redoStack);
  }

  function redo(): SceneHistoryResult {
    return restore(redoStack, undoStack);
  }

  function activateProject(projectPath: string): SceneSnapshot {
    persistActiveProject();
    activeProjectPath = resolve(projectPath);
    snapshot = options.loadProjectSnapshot?.(activeProjectPath) ?? createDefaultScene();
    undoStack.length = 0;
    redoStack.length = 0;
    options.broadcast({ id: options.createId("event"), type: "scene.snapshot.restored", payload: snapshot });
    return snapshot;
  }

  /** Replaces a scene imported from an ArchAgent scene file as one undoable operation. */
  function replaceSnapshot(nextSnapshot: SceneSnapshot): SceneSnapshot {
    undoStack.push(snapshot);
    redoStack.length = 0;
    snapshot = nextSnapshot;
    persistActiveProject();
    options.broadcast({ id: options.createId("event"), type: "scene.snapshot.restored", payload: snapshot });
    return snapshot;
  }

  function persistActiveProject(): void {
    if (activeProjectPath) options.saveProjectSnapshot?.(activeProjectPath, snapshot);
  }

  return { getSnapshot, execute, executeBatch, getHistoryState, undo, redo, activateProject, getActiveProjectPath: () => activeProjectPath, replaceSnapshot };
}
