import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

const DEFAULT_CHAT_PANEL_WIDTH = 420;
const MIN_CHAT_PANEL_WIDTH = 320;
const MAX_CHAT_PANEL_WIDTH = 640;
const RESIZER_WIDTH = 8;
const ACTIVITY_BAR_WIDTH = 54;
const EDITOR_MIN_WIDTH = 360;
const COMPONENT_LIBRARY_MIN_WIDTH = 212;

interface UseResizableChatPanelOptions {
  rootRef: RefObject<HTMLElement | null>;
  componentLibraryOpen: boolean;
}

interface ResizableChatPanel {
  width: number;
  minWidth: number;
  maxWidth: number;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
}

function getMaximumWidth(componentLibraryOpen: boolean): number {
  const fixedWidth =
    ACTIVITY_BAR_WIDTH + RESIZER_WIDTH + EDITOR_MIN_WIDTH + (componentLibraryOpen ? COMPONENT_LIBRARY_MIN_WIDTH : 0);
  return Math.max(MIN_CHAT_PANEL_WIDTH, Math.min(MAX_CHAT_PANEL_WIDTH, window.innerWidth - fixedWidth));
}

/**
 * Resizes the chat column through a CSS variable so pointer movement never re-renders the 3D workspace.
 */
export function useResizableChatPanel({
  rootRef,
  componentLibraryOpen
}: UseResizableChatPanelOptions): ResizableChatPanel {
  const [width, setWidth] = useState(DEFAULT_CHAT_PANEL_WIDTH);
  const widthRef = useRef(DEFAULT_CHAT_PANEL_WIDTH);
  const draggingRef = useRef(false);

  const clampWidth = useCallback(
    (nextWidth: number): number => Math.min(getMaximumWidth(componentLibraryOpen), Math.max(MIN_CHAT_PANEL_WIDTH, nextWidth)),
    [componentLibraryOpen]
  );

  const applyWidth = useCallback(
    (nextWidth: number): number => {
      const clampedWidth = clampWidth(nextWidth);
      widthRef.current = clampedWidth;
      rootRef.current?.style.setProperty("--chat-panel-width", `${clampedWidth}px`);
      return clampedWidth;
    },
    [clampWidth, rootRef]
  );

  const commitWidth = useCallback(
    (nextWidth: number): void => {
      const clampedWidth = applyWidth(nextWidth);
      setWidth(clampedWidth);
    },
    [applyWidth]
  );

  const finishDragging = useCallback((): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.classList.remove("is-resizing-chat-panel");
    commitWidth(widthRef.current);
  }, [commitWidth]);

  const resizeFromPointer = useCallback(
    (clientX: number): void => {
      const shellRight = rootRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      applyWidth(shellRight - clientX - RESIZER_WIDTH / 2);
    },
    [applyWidth, rootRef]
  );

  useEffect(() => {
    commitWidth(widthRef.current);
    const handleResize = (): void => commitWidth(widthRef.current);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.classList.remove("is-resizing-chat-panel");
    };
  }, [commitWidth]);

  return {
    width,
    minWidth: MIN_CHAT_PANEL_WIDTH,
    maxWidth: getMaximumWidth(componentLibraryOpen),
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add("is-resizing-chat-panel");
      resizeFromPointer(event.clientX);
      event.preventDefault();
    },
    onPointerMove: (event) => {
      if (!draggingRef.current) return;
      resizeFromPointer(event.clientX);
    },
    onPointerUp: finishDragging,
    onPointerCancel: finishDragging,
    onKeyDown: (event) => {
      const step = 16;
      let nextWidth: number | undefined;
      if (event.key === "ArrowLeft") nextWidth = widthRef.current + step;
      if (event.key === "ArrowRight") nextWidth = widthRef.current - step;
      if (event.key === "Home") nextWidth = MIN_CHAT_PANEL_WIDTH;
      if (event.key === "End") nextWidth = getMaximumWidth(componentLibraryOpen);
      if (nextWidth === undefined) return;
      event.preventDefault();
      commitWidth(nextWidth);
    }
  };
}
