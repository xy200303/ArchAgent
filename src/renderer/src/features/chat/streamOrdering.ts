/** Produces stable display ordering and process groups for streamed Agent items. */
import type { StreamItem } from "../../../../shared/types";

export type MessageStreamItem = Extract<StreamItem, { kind: "message" }>;
export type ToolProcessStreamItem = Extract<StreamItem, { kind: "tool" | "file" | "stage" }>;
export type ProcessStreamItem = ToolProcessStreamItem | MessageStreamItem;

export type StreamDisplayBlock =
  | {
      id: string;
      kind: "message";
      item: MessageStreamItem;
    }
  | {
      id: string;
      kind: "process";
      items: ProcessStreamItem[];
    };

export function orderStreamItemsForDisplay(items: StreamItem[]): StreamItem[] {
  const ordered: StreamItem[] = [];
  let turnItems: StreamItem[] = [];

  const flushTurn = (): void => {
    if (!turnItems.length) return;

    const userMessages: StreamItem[] = [];
    const toolOutputs: StreamItem[] = [];
    const assistantMessages: StreamItem[] = [];

    for (const item of turnItems) {
      if (item.kind === "message" && item.role === "user") {
        userMessages.push(item);
      } else if (item.kind === "message" && item.role === "assistant") {
        assistantMessages.push(item);
      } else {
        toolOutputs.push(item);
      }
    }

    ordered.push(...userMessages, ...toolOutputs, ...assistantMessages);
    turnItems = [];
  };

  for (const item of items.filter(shouldDisplayStreamItem)) {
    if (item.kind === "message" && item.role === "user" && turnItems.length) {
      flushTurn();
    }
    turnItems.push(item);
  }

  flushTurn();
  return ordered;
}

export function groupStreamItemsForDisplay(items: StreamItem[]): StreamDisplayBlock[] {
  const blocks: StreamDisplayBlock[] = [];
  let processItems: ProcessStreamItem[] = [];

  const flushProcessItems = (): void => {
    if (!processItems.length) return;
    blocks.push({
      id: `process_${processItems[0].id}`,
      kind: "process",
      items: processItems
    });
    processItems = [];
  };

  const flushTurn = (): void => {
    const finalAssistantIndex = findFinalAssistantIndex(processItems);
    const finalAssistant = finalAssistantIndex >= 0 ? processItems[finalAssistantIndex] as MessageStreamItem : undefined;
    if (finalAssistantIndex >= 0) processItems.splice(finalAssistantIndex, 1);
    flushProcessItems();
    if (finalAssistant) {
      blocks.push({
        id: finalAssistant.id,
        kind: "message",
        item: finalAssistant
      });
    }
  };

  for (const item of items) {
    if (!shouldDisplayStreamItem(item)) continue;
    if (item.kind === "message" && item.role === "user") {
      flushTurn();
      blocks.push({ id: item.id, kind: "message", item });
      continue;
    }
    processItems.push(item);
  }

  flushTurn();
  return blocks;
}

function findFinalAssistantIndex(items: ProcessStreamItem[]): number {
  let lastToolEventIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].kind !== "message") {
      lastToolEventIndex = index;
      break;
    }
  }
  for (let index = items.length - 1; index > lastToolEventIndex; index -= 1) {
    const item = items[index];
    if (item.kind === "message" && item.role === "assistant") return index;
  }
  return -1;
}

function shouldDisplayStreamItem(item: StreamItem): boolean {
  if (item.kind === "tool" && item.toolName === "openai.chat.tools") return false;
  if (item.kind === "message" && item.role === "assistant" && item.isFinished && !item.content.trim() && !item.failure) {
    return false;
  }
  return true;
}
