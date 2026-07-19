/** Connects session selection and session dialogs without involving the transcript or composer. */
import { memo, useCallback, useState, type JSX } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { ChatSession } from "../../../../shared/types";
import { setCurrentSession, type AppDispatch, type RootState } from "../../app/store";
import { ChatPanelHeader } from "./ChatPanelHeader";
import { RenameSessionDialog } from "./ChatDialogs";

export const ChatSessionHeader = memo(function ChatSessionHeader({
  onCreateConversation,
  onRenameSession,
  onDeleteSession,
  onError
}: {
  onCreateConversation: () => Promise<void>;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onError: (message: string) => void;
}): JSX.Element {
  const dispatch = useDispatch<AppDispatch>();
  const sessions = useSelector((state: RootState) => state.chat.sessions, areSessionHeadersEqual);
  const currentSessionId = useSelector((state: RootState) => state.chat.currentSessionId);
  const [renameTarget, setRenameTarget] = useState<ChatSession>();
  const [deletingSessionId, setDeletingSessionId] = useState<string>();
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const selectSession = useCallback((sessionId: string): void => {
    dispatch(setCurrentSession(sessionId));
  }, [dispatch]);
  const openRenameDialog = useCallback((session: ChatSession): void => setRenameTarget(session), []);
  const deleteSession = useCallback(async (session: ChatSession): Promise<void> => {
    if (deletingSessionId) return;
    setDeletingSessionId(session.id);
    try {
      await onDeleteSession(session.id);
    } catch (error) {
      onError(`删除对话失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDeletingSessionId(undefined);
    }
  }, [deletingSessionId, onDeleteSession, onError]);

  return (
    <div className="chat-session-header-slot">
      <ChatPanelHeader
        sessions={sessions}
        currentSession={currentSession}
        currentSessionId={currentSessionId}
        onCreateConversation={onCreateConversation}
        onSelectSession={selectSession}
        onRenameSession={openRenameDialog}
        onDeleteSession={(session) => void deleteSession(session)}
        deletingSessionId={deletingSessionId}
      />
      {renameTarget ? (
        <RenameSessionDialog
          session={renameTarget}
          onClose={() => setRenameTarget(undefined)}
          onRename={onRenameSession}
        />
      ) : null}
    </div>
  );
});

/** Header content depends on session metadata, never on transcript items. */
function areSessionHeadersEqual(previous: ChatSession[], next: ChatSession[]): boolean {
  return previous.length === next.length && previous.every((session, index) => {
    const nextSession = next[index];
    return (
      nextSession?.id === session.id &&
      nextSession.title === session.title &&
      nextSession.updatedAt === session.updatedAt
    );
  });
}
