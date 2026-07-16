/** Connects artifact history directly to chat state to avoid refreshing the workbench shell. */
import { useCallback, type JSX } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import type { ArchAgentApi } from "../../../../shared/types";
import { setArtifactsOpen, type AppDispatch, type RootState } from "../../app/store";
import { ArtifactHistoryPanel } from "./ChatDialogs";

export function ArtifactHistoryDialog({
  api,
  onError,
  onPreviewArtifact
}: {
  api: ArchAgentApi;
  onError: (message: string) => void;
  onPreviewArtifact: (artifactId: string) => void;
}): JSX.Element {
  const dispatch = useDispatch<AppDispatch>();
  const { artifacts, sessions } = useSelector(
    (state: RootState) => ({ artifacts: state.chat.artifacts, sessions: state.chat.sessions }),
    shallowEqual
  );
  const close = useCallback((): void => {
    dispatch(setArtifactsOpen(false));
  }, [dispatch]);
  const previewArtifact = useCallback((artifactId: string): void => {
    close();
    onPreviewArtifact(artifactId);
  }, [close, onPreviewArtifact]);

  return (
    <ArtifactHistoryPanel
      artifacts={artifacts}
      sessions={sessions}
      onClose={close}
      api={api}
      onError={onError}
      onPreviewArtifact={previewArtifact}
    />
  );
}
