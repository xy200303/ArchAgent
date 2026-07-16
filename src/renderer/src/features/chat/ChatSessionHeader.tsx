/** Connects session selection and session dialogs without involving the transcript or composer. */
import { memo, useCallback, useState, type JSX } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { ChatSession } from "../../../../shared/types";
import { setCurrentSession, type AppDispatch, type RootState } from "../../app/store";
import { ChatPanelHeader } from "./ChatPanelHeader";
import { DeleteSessionDialog, RenameSessionDialog } from "./ChatDialogs";

export const ChatSessionHeader = memo(function ChatSessionHeader({
  onCreateConversation,
  onRenameSession,
  onDeleteSession
}: {
  onCreateConversation: () => Promise<void>;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
}): JSX.Element {
  const dispatch = useDispatch<AppDispatch>();
  const sessions = useSelector((state: RootState) => state.chat.sessions, areSessionHeadersEqual);
  const currentSessionId = useSelector((state: RootState) => state.chat.currentSessionId);
  const [renameTarget, setRenameTarget] = useState<ChatSession>();
  const [deleteTarget, setDeleteTarget] = useState<ChatSession>();
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const selectSession = useCallback((sessionId: string): void => {
    dispatch(setCurrentSession(sessionId));
  }, [dispatch]);
  const openRenameDialog = useCallback((session: ChatSession): void => setRenameTarget(session), []);
  const openDeleteDialog = useCallback((session: ChatSession): void => setDeleteTarget(session), []);

  return (
    <div className="chat-session-header-slot">
      <ChatPanelHeader
        sessions={sessions}
        currentSession={currentSession}
        currentSessionId={currentSessionId}
        onCreateConversation={onCreateConversation}
        onSelectSession={selectSession}
        onRenameSession={openRenameDialog}
        onDeleteSession={openDeleteDialog}
      />
      {renameTarget ? (
        <RenameSessionDialog
          session={renameTarget}
          onClose={() => setRenameTarget(undefined)}
          onRename={onRenameSession}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteSessionDialog
          session={deleteTarget}
          onClose={() => setDeleteTarget(undefined)}
          onDelete={onDeleteSession}
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
