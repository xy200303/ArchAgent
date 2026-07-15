/** Selects the WebGPU viewer or WebGL fallback based on runtime capability. */
import { useEffect, useState, lazy, Suspense } from "react";
import { SimpleWebGLFallback } from "./SimpleWebGLFallback";
import type { JSX } from "react";

const PascalViewer = lazy(() => import("./PascalViewer"));

export function SpatialEditor(): JSX.Element {
  const [mode, setMode] = useState<"checking" | "webgpu" | "webgl" | "error">("checking");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    void checkWebGPU();
  }, []);

  async function checkWebGPU(): Promise<void> {
    try {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu;
      if (!gpu) {
        throw new Error("当前浏览器/环境不支持 WebGPU。");
      }
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        throw new Error("WebGPU adapter 获取失败，可能是显卡驱动未安装或被禁用。");
      }
      setMode("webgpu");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setMode("webgl");
    }
  }

  function handlePascalError(message: string): void {
    setErrorMessage(message);
    setMode("error");
  }

  if (mode === "webgl") {
    return (
      <SimpleWebGLFallback>
        {errorMessage ? (
          <span className="spatial-editor-error-hint" title={errorMessage}>WebGPU 不可用，已降级</span>
        ) : null}
        <button type="button" className="primary-action" onClick={() => { setErrorMessage(""); void checkWebGPU(); }}>
          重试 Pascal WebGPU
        </button>
      </SimpleWebGLFallback>
    );
  }

  if (mode === "error") {
    return (
      <SimpleWebGLFallback>
        <span className="spatial-editor-error-hint" title={errorMessage}>Pascal 启动失败</span>
        <button type="button" className="primary-action" onClick={() => { setErrorMessage(""); setMode("webgpu"); }}>
          重试 Pascal WebGPU
        </button>
      </SimpleWebGLFallback>
    );
  }

  if (mode === "checking") {
    return (
      <div className="spatial-editor spatial-editor-fallback">
        <strong>正在检查 WebGPU 支持…</strong>
        <span>请稍候，若不支持将自动降级到 WebGL 预览。</span>
      </div>
    );
  }

  return (
    <div className="spatial-editor">
      <div className="spatial-editor-notice">
        <span>正在使用 Pascal WebGPU 模式</span>
        <div className="spatial-editor-notice-actions">
          <button type="button" className="secondary-action" onClick={() => setMode("webgl")}>
            切换到 WebGL 预览
          </button>
        </div>
      </div>
      <Suspense fallback={<div className="spatial-editor-fallback">加载 Pascal 编辑器…</div>}>
        <PascalViewer onError={handlePascalError} />
      </Suspense>
    </div>
  );
}
