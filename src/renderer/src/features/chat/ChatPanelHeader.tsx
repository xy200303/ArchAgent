/** Conversation selector and session actions for the chat panel header. */
import { memo, type JSX } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  PencilLine,
  Plus,
  Settings,
  Trash2
} from "lucide-react";
import type { ChatSession } from "../../../../shared/types";
import { formatDateTime } from "../../shared/presentation";

function SessionMoreMenu({
  session,
  onRenameSession,
  onDeleteSession
}: {
  session: ChatSession;
  onRenameSession: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;
}): JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="session-menu-button" aria-label={`打开 ${session.title} 的操作菜单`}>
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-content" side="right" align="start" sideOffset={6}>
          <DropdownMenu.Item className="dropdown-item" onSelect={() => onRenameSession(session)}>
            <PencilLine size={14} />
            重命名
          </DropdownMenu.Item>
          <DropdownMenu.Item className="dropdown-item danger" onSelect={() => onDeleteSession(session)}>
            <Trash2 size={14} />
            删除对话
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export const ChatPanelHeader = memo(function ChatPanelHeader({
  sessions,
  currentSession,
  currentSessionId,
  onCreateConversation,
  onSelectSession,
  onRenameSession,
  onDeleteSession
}: {
  sessions: ChatSession[];
  currentSession?: ChatSession;
  currentSessionId?: string;
  onCreateConversation: () => void;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;
}): JSX.Element {
  return (
    <header className="chat-panel-header">
      <div className="chat-session-select">
        <Select.Root value={currentSessionId || ""} onValueChange={onSelectSession}>
          <Select.Trigger className="session-select-trigger" aria-label="选择设计会话">
            <Select.Value placeholder="选择会话" />
            <Select.Icon className="session-select-icon">
              <ChevronDown size={14} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="session-select-content" position="popper" sideOffset={4}>
              <Select.Viewport className="session-select-viewport">
                {sessions.map((session) => (
                  <Select.Item className="session-select-item" value={session.id} key={session.id}>
                    <Select.ItemIndicator className="session-select-item-indicator">
                      <Check size={14} />
                    </Select.ItemIndicator>
                    <Select.ItemText>
                      <span className="session-select-item-title">{session.title}</span>
                    </Select.ItemText>
                    <span className="session-select-item-date">{formatDateTime(session.updatedAt)}</span>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
      <div className="chat-header-actions">
        <button type="button" className="icon-action" onClick={onCreateConversation} aria-label="新建设计会话">
          <Plus size={16} />
        </button>
        {currentSession ? (
          <SessionMoreMenu
            session={currentSession}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
          />
        ) : null}
      </div>
    </header>
  );
});
