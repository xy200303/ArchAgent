/** Broadcasts renderer events and throttles unfinished assistant-message updates. */
import type { AgentResponseEvent, RendererEvent, StreamItem } from "../../shared/types";

const STREAM_ITEM_UPDATE_THROTTLE_MS = 80;

export interface RendererEventBus {
  sendEvent(event: RendererEvent): void;
  sendResponseItemCreated(sessionId: string, item: StreamItem): void;
  sendResponseItemUpdated(sessionId: string, item: StreamItem): void;
  sendTurnStatus(sessionId: string, status: "running" | "completed" | "failed"): void;
  clearPendingSessionUpdates(sessionId: string): void;
}

export function createRendererEventBus(options: {
  createId: (prefix: string) => string;
  broadcast: (event: RendererEvent) => void;
}): RendererEventBus {
  const pendingEvents = new Map<string, RendererEvent>();
  const pendingTimers = new Map<string, NodeJS.Timeout>();

  function getUpdateKey(sessionId: string, itemId: string): string {
    return `${sessionId}:${itemId}`;
  }

  function flushPendingUpdate(sessionId: string, itemId: string): void {
    const key = getUpdateKey(sessionId, itemId);
    const timer = pendingTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(key);
    }
    const event = pendingEvents.get(key);
    if (!event) return;
    pendingEvents.delete(key);
    options.broadcast(event);
  }

  function createItemEvent(sessionId: string, item: StreamItem, updated: boolean): AgentResponseEvent {
    const id = options.createId("event");
    if (item.kind === "message") {
      if (item.failure) return { id, type: "agent.message.failed", sessionId, payload: item, error: item.failure };
      if (item.isFinished) return { id, type: "agent.message.completed", sessionId, payload: item };
      return { id, type: updated ? "agent.message.delta" : "agent.message.created", sessionId, payload: item };
    }
    if (item.kind === "tool") {
      if (item.status === "failed") return { id, type: "agent.tool.failed", sessionId, payload: item };
      if (item.status === "success") return { id, type: "agent.tool.completed", sessionId, payload: item };
      return { id, type: updated ? "agent.tool.progress" : "agent.tool.started", sessionId, payload: item };
    }
    if (item.kind === "stage") return { id, type: "agent.stage.updated", sessionId, payload: item };
    return { id, type: "agent.file.created", sessionId, payload: item };
  }

  function sendResponseItemCreated(sessionId: string, item: StreamItem): void {
    options.broadcast(createItemEvent(sessionId, item, false));
  }

  function sendResponseItemUpdated(sessionId: string, item: StreamItem): void {
    const event = createItemEvent(sessionId, item, true);
    const shouldThrottle = event.type === "agent.message.delta";
    if (!shouldThrottle) {
      flushPendingUpdate(sessionId, item.id);
      options.broadcast(event);
      return;
    }

    const key = getUpdateKey(sessionId, item.id);
    pendingEvents.set(key, event);
    if (pendingTimers.has(key)) return;
    pendingTimers.set(
      key,
      setTimeout(() => flushPendingUpdate(sessionId, item.id), STREAM_ITEM_UPDATE_THROTTLE_MS)
    );
  }

  function sendTurnStatus(sessionId: string, status: "running" | "completed" | "failed"): void {
    const type = status === "running" ? "agent.turn.started" : status === "completed" ? "agent.turn.completed" : "agent.turn.failed";
    options.broadcast({ id: options.createId("event"), type, sessionId });
  }

  function clearPendingSessionUpdates(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of Array.from(pendingEvents.keys())) {
      if (!key.startsWith(prefix)) continue;
      const timer = pendingTimers.get(key);
      if (timer) clearTimeout(timer);
      pendingTimers.delete(key);
      pendingEvents.delete(key);
    }
  }

  return {
    sendEvent: options.broadcast,
    sendResponseItemCreated,
    sendResponseItemUpdated,
    sendTurnStatus,
    clearPendingSessionUpdates
  };
}
