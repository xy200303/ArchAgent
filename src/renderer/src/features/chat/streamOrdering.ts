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
  let turnItems: StreamItem[] = [];

  const flushProcessItems = (processItems: ProcessStreamItem[]): void => {
    if (!processItems.length) return;
    blocks.push({
      id: `process_${processItems[0].id}`,
      kind: "process",
      items: processItems
    });
  };

  const flushTurn = (): void => {
    if (!turnItems.length) return;

    const userMessages = turnItems.filter(
      (item): item is MessageStreamItem => item.kind === "message" && item.role === "user"
    );
    const nonUserItems = turnItems.filter((item) => !(item.kind === "message" && item.role === "user"));
    const assistantMessages = nonUserItems.filter(
      (item): item is MessageStreamItem => item.kind === "message" && item.role === "assistant"
    );
    const finalAssistant = assistantMessages.at(-1);
    const processItems = nonUserItems.filter((item): item is ProcessStreamItem => {
      if (finalAssistant && item.id === finalAssistant.id) return false;
      return item.kind === "tool" || item.kind === "file" || item.kind === "stage" || item.kind === "message";
    });

    for (const item of userMessages) {
      blocks.push({
        id: item.id,
        kind: "message",
        item
      });
    }

    flushProcessItems(processItems);

    if (finalAssistant) {
      blocks.push({
        id: finalAssistant.id,
        kind: "message",
        item: finalAssistant
      });
    }

    turnItems = [];
  };

  for (const item of items.filter(shouldDisplayStreamItem)) {
    if (item.kind === "message" && item.role === "user" && turnItems.length) {
      flushTurn();
    }
    turnItems.push(item);
  }

  flushTurn();
  return blocks;
}

function shouldDisplayStreamItem(item: StreamItem): boolean {
  if (item.kind === "tool" && item.toolName === "openai.chat.tools") return false;
  if (item.kind === "message" && item.role === "assistant" && item.isFinished && !item.content.trim()) {
    return false;
  }
  return true;
}
