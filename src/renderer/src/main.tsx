import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import "@incremark/theme/styles.css";
import "./styles.css";
import { App } from "./app/App";
import { store } from "./app/store";
import { ErrorBoundary } from "./platform/ErrorBoundary";

function renderFatalError(message: string, detail?: unknown): void {
  const root = document.getElementById("root");
  const detailText = detail instanceof Error ? detail.stack || detail.message : String(detail);
  const html = `
    <div class="bridge-missing app-crash" style="padding:24px">
      <strong>应用初始化失败</strong>
      <span>${message}</span>
      <pre style="text-align:left;max-width:800px;overflow:auto;font-size:12px;opacity:0.8">${detailText}</pre>
      <button type="button" onclick="window.location.reload()">刷新界面</button>
    </div>
  `;
  if (root) {
    root.innerHTML = html;
  } else {
    document.body.innerHTML = html;
  }
}

window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
  renderFatalError("运行时发生未捕获错误", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
  renderFatalError("异步任务发生未处理异常", event.reason);
});

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Provider store={store}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </Provider>
    </React.StrictMode>
  );
} catch (error) {
  renderFatalError("React 渲染初始化失败", error);
}
