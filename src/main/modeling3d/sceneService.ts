/** Coordinates the authoritative in-memory scene and broadcasts accepted commands. */
import type { RendererEvent } from "../../shared/types";
import {
  applySceneCommand,
  createDefaultScene
} from "../../shared/modeling3d/sceneReducer";
import type {
  SceneCommandInput,
  SceneCommandResult,
  SceneSnapshot
} from "../../shared/modeling3d/sceneContracts";

export interface SceneService {
  getSnapshot(): SceneSnapshot;
  execute(command: SceneCommandInput): SceneCommandResult;
}

export function createSceneService(options: {
  createId: (prefix: string) => string;
  broadcast: (event: RendererEvent) => void;
}): SceneService {
  let snapshot = createDefaultScene();

  function getSnapshot(): SceneSnapshot {
    return snapshot;
  }

  function execute(command: SceneCommandInput): SceneCommandResult {
    const result = applySceneCommand(snapshot, command, () => options.createId("wall"));
    if (!result.accepted) return result;

    snapshot = result.snapshot;
    options.broadcast({
      id: options.createId("event"),
      type: "scene.command.applied",
      payload: result
    });
    return result;
  }

  return { getSnapshot, execute };
}
