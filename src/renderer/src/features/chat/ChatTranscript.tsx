/** Subscribes to the active transcript only, so composer changes do not redraw messages. */
import { memo, type JSX } from "react";
import { useSelector } from "react-redux";
import type { ArchAgentApi } from "../../../../shared/types";
import type { RootState } from "../../app/store";
import { MessagePane } from "./MessagePane";

export const ChatTranscript = memo(function ChatTranscript({
  api,
  onPreviewArtifact,
  onError
}: {
  api: ArchAgentApi;
  onPreviewArtifact: (artifactId: string) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const session = useSelector((state: RootState) =>
    state.chat.sessions.find((item) => item.id === state.chat.currentSessionId)
  );

  return <MessagePane api={api} session={session} onPreviewArtifact={onPreviewArtifact} onError={onError} />;
});
