/** Broadcasts renderer events and throttles unfinished assistant-message updates. */
import type { RendererEvent, StreamItem } from "../../shared/types";

const STREAM_ITEM_UPDATE_THROTTLE_MS = 80;

export interface RendererEventBus {
  sendEvent(event: RendererEvent): void;
  sendStreamItemUpdated(sessionId: string, item: StreamItem): void;
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

  function sendStreamItemUpdated(sessionId: string, item: StreamItem): void {
    const event: RendererEvent = {
      id: options.createId("event"),
      type: "stream.item.updated",
      sessionId,
      payload: item
    };
    const shouldThrottle = item.kind === "message" && item.role === "assistant" && !item.isFinished;
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
    sendStreamItemUpdated,
    clearPendingSessionUpdates
  };
}
