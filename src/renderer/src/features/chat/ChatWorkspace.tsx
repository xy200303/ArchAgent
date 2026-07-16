/** Isolates chat-specific store updates from the persistent editor workspace. */
import { memo, type JSX } from "react";
import type { ArchAgentApi } from "../../../../shared/types";
import { ChatComposerContainer } from "./ChatComposerContainer";
import { ChatSessionHeader } from "./ChatSessionHeader";
import { ChatTranscript } from "./ChatTranscript";

export const ChatWorkspace = memo(function ChatWorkspace({
  api,
  onCreateConversation,
  onPreviewArtifact,
  onError,
  onRenameSession,
  onDeleteSession
}: {
  api: ArchAgentApi;
  onCreateConversation: () => Promise<void>;
  onPreviewArtifact: (artifactId: string) => void;
  onError: (message: string) => void;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
}): JSX.Element {
  return (
    <aside className="chat-panel">
      <ChatSessionHeader
        onCreateConversation={onCreateConversation}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
      />
      <ChatTranscript
        api={api}
        onPreviewArtifact={onPreviewArtifact}
        onError={onError}
      />
      <ChatComposerContainer api={api} onError={onError} />
    </aside>
  );
});
