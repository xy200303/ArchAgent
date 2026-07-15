/** Stable loading placeholder shared by lazy file and 3D preview paths. */
import { Loader2 } from "lucide-react";
import type { JSX } from "react";

export function PreviewLoadingPanel(): JSX.Element {
  return (
    <div className="preview-loading-panel" role="status">
      <Loader2 size={16} className="spin" />
      正在加载文件预览...
    </div>
  );
}
