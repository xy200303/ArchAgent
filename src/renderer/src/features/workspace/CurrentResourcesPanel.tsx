/** Current conversation resources shown beside the activity bar. */
import type { JSX } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { ExternalLink, FolderOpen, PackageOpen } from "lucide-react";
import type { ArchAgentApi, SessionResourceSummary } from "../../../../shared/types";
import { formatBytes, getWorkspaceFileIconSpec } from "../../shared/presentation";
import { SidePanelHeader } from "../../shared/SidePanelHeader";

export function CurrentResourcesPanel({
  api,
  resources,
  onPreviewResource
}: {
  api: ArchAgentApi;
  resources: SessionResourceSummary[];
  onPreviewResource: (resourceId: string) => void;
}): JSX.Element {
  return (
    <aside className="resource-sidebar current-resources-panel" aria-label="当前资源">
      <SidePanelHeader title="当前资源" icon={PackageOpen} meta={`${resources.length} 个会话资源`} />
      <ScrollArea.Root className="explorer-scroll">
        <ScrollArea.Viewport className="explorer-viewport">
          <div className="current-resource-list">
            {resources.length ? resources.map((resource) => (
              <CurrentResourceRow
                api={api}
                resource={resource}
                key={resource.id}
                onPreviewResource={onPreviewResource}
              />
            )) : <div className="explorer-empty">当前会话尚无资源</div>}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}

function CurrentResourceRow({
  api,
  resource,
  onPreviewResource
}: {
  api: ArchAgentApi;
  resource: SessionResourceSummary;
  onPreviewResource: (resourceId: string) => void;
}): JSX.Element {
  const { Icon, className } = getWorkspaceFileIconSpec(resource.name);
  return (
    <div className="current-resource-row">
      <button type="button" className="current-resource-main" onClick={() => onPreviewResource(resource.id)}>
        <Icon size={16} className={className} />
        <span>
          <strong title={resource.name}>{resource.name}</strong>
          <small>{getResourceSourceLabel(resource.source)} · {formatBytes(resource.size)}</small>
        </span>
      </button>
      <button
        type="button"
        className="current-resource-action"
        aria-label={`在系统中显示 ${resource.name}`}
        title="在系统中显示"
        onClick={() => void api.resource.reveal(resource.id)}
      >
        <FolderOpen size={14} />
      </button>
      <button
        type="button"
        className="current-resource-action"
        aria-label={`打开 ${resource.name}`}
        title="在系统中打开"
        onClick={() => void api.resource.open(resource.id)}
      >
        <ExternalLink size={14} />
      </button>
    </div>
  );
}

function getResourceSourceLabel(source: SessionResourceSummary["source"]): string {
  if (source === "user_upload") return "用户上传";
  if (source === "generated") return "生成资源";
  return "派生资源";
}
