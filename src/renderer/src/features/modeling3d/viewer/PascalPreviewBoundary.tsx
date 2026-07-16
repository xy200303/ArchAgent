/** Keeps a Pascal renderer failure isolated from the editor workbench. */
import { Component, type ErrorInfo, type ReactNode } from "react";

export class PascalPreviewBoundary extends Component<{
  children: ReactNode;
  onRetry: () => void;
}, {
  error?: Error;
}> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Pascal preview failed:", error, errorInfo);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="pascal-preview-fallback" role="alert">
        <strong>Pascal 预览无法启动</strong>
        <span>{this.state.error.message || "当前设备未能初始化 Pascal/WebGPU。"}</span>
        <button type="button" className="secondary-action" onClick={this.props.onRetry}>重新加载 Pascal 预览</button>
      </div>
    );
  }
}
