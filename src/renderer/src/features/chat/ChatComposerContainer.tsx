/** Connects only composer-relevant state, keeping typing independent from stream updates. */
import { memo, useCallback, useMemo, type JSX } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import type { ArchAgentApi } from "../../../../shared/types";
import {
  addAttachments,
  clearComposer,
  removeAttachment,
  setComposer,
  type AppDispatch,
  type RootState
} from "../../app/store";
import { Composer, type ComposerSession } from "./Composer";

export const ChatComposerContainer = memo(function ChatComposerContainer({
  api,
  onError
}: {
  api: ArchAgentApi;
  onError: (message: string) => void;
}): JSX.Element {
  const dispatch = useDispatch<AppDispatch>();
  const { sessionId, sessionStatus, composer, pendingAttachments } = useSelector(
    (state: RootState) => {
      const session = state.chat.sessions.find((item) => item.id === state.chat.currentSessionId);
      return {
        sessionId: session?.id,
        sessionStatus: session?.status,
        composer: state.chat.composer,
        pendingAttachments: state.chat.pendingAttachments
      };
    },
    shallowEqual
  );
  const session = useMemo<ComposerSession | undefined>(
    () => (sessionId && sessionStatus ? { id: sessionId, status: sessionStatus } : undefined),
    [sessionId, sessionStatus]
  );
  const changeComposer = useCallback((value: string): void => {
    dispatch(setComposer(value));
  }, [dispatch]);
  const addPendingAttachments = useCallback((attachments: Parameters<typeof addAttachments>[0]["attachments"]): void => {
    dispatch(addAttachments({ attachments }));
  }, [dispatch]);
  const removePendingAttachment = useCallback((id: string): void => {
    dispatch(removeAttachment(id));
    void api.attachment.remove(id);
  }, [api, dispatch]);
  const clearSentComposer = useCallback((sentSessionId: string): void => {
    dispatch(clearComposer(sentSessionId));
  }, [dispatch]);

  return (
    <Composer
      api={api}
      session={session}
      value={composer}
      attachments={pendingAttachments}
      onChange={changeComposer}
      onAddAttachments={addPendingAttachments}
      onRemoveAttachment={removePendingAttachment}
      onSent={clearSentComposer}
      onError={onError}
    />
  );
});
