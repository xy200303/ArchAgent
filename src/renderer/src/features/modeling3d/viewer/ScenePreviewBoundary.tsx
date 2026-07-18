/** Keeps an unexpected viewport failure isolated from the surrounding editor. */
import { Component, type ErrorInfo, type ReactNode } from "react";

export class ScenePreviewBoundary extends Component<{
  children: ReactNode;
  onRetry: () => void;
}, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {}

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <div className="scene-preview-fallback" role="alert"><strong>三维视图暂时不可用</strong><span>{this.state.error.message}</span><button type="button" onClick={this.props.onRetry}>重新加载</button></div>;
  }
}
