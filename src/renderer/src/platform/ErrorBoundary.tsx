/** Prevents renderer crashes from taking down the whole Electron workbench. */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Renderer UI crashed:", error, errorInfo);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="bridge-missing app-crash">
        <strong>界面渲染异常</strong>
        <span>{this.state.error.message || "渲染进程遇到未知错误。"}</span>
        <small>可以先刷新界面恢复；如果反复出现，请保留当前操作步骤和控制台日志。</small>
        <button type="button" onClick={() => window.location.reload()}>
          刷新界面
        </button>
      </div>
    );
  }
}
