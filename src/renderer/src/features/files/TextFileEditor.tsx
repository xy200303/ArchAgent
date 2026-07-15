/** Provides a focused Monaco editor with explicit save and dirty-state handling. */
import { useEffect, useRef, type JSX } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { ensureMonacoConfigured } from "./monacoSetup";
import { getErrorMessage } from "../../platform/bridge";

ensureMonacoConfigured();

/**
 * 基于 Monaco 的文本文件查看/编辑器（VS Code 风格，无自带工具栏）。
 * 有 path 且提供 onSave 时可编辑（Ctrl+S 保存），未保存状态通过 onDirtyChange 上报。
 */
export function TextFileEditor(props: {
  name: string;
  path?: string;
  value: string;
  language: string;
  theme: "light" | "dark";
  readOnly?: boolean;
  readOnlyReason?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onError?: (message: string) => void;
  onSave?: (content: string) => Promise<void>;
}): JSX.Element {
  const editable = Boolean(props.path && props.onSave) && !props.readOnly;
  const draftRef = useRef(props.value);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    draftRef.current = props.value;
  }, [props.value]);

  function reportDirty(dirty: boolean): void {
    if (dirty === dirtyRef.current) return;
    dirtyRef.current = dirty;
    props.onDirtyChange?.(dirty);
  }

  async function save(): Promise<void> {
    if (!editable || !props.onSave || savingRef.current || !dirtyRef.current) return;
    savingRef.current = true;
    try {
      await props.onSave(draftRef.current);
      reportDirty(false);
    } catch (error) {
      props.onError?.(`保存失败：${getErrorMessage(error)}`);
    } finally {
      savingRef.current = false;
    }
  }

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void save();
    });
    editor.focus();
  };

  return (
    <section className="inline-preview text-editor-pane">
      {props.readOnlyReason ? <div className="text-editor-hint-bar">{props.readOnlyReason}</div> : null}
      <div className="text-editor-host">
        <Editor
          path={props.path ?? props.name}
          value={props.value}
          language={props.language}
          theme={props.theme === "dark" ? "vs-dark" : "vs"}
          loading={<div className="text-editor-loading">编辑器加载中…</div>}
          options={{
            readOnly: !editable,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            padding: { top: 10, bottom: 10 },
            renderWhitespace: "selection",
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
          }}
          onMount={handleMount}
          onChange={(value) => {
            const next = value ?? "";
            draftRef.current = next;
            reportDirty(next !== props.value);
          }}
        />
      </div>
    </section>
  );
}
