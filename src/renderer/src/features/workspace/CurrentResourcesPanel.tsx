/** Current conversation resources shown beside the activity bar. */
import type { JSX } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { ExternalLink, FolderOpen, PackageOpen } from "lucide-react";
import type { ArchAgentApi, ArtifactSummary } from "../../../../shared/types";
import { formatBytes, getWorkspaceFileIconSpec } from "../../shared/presentation";
import { SidePanelHeader } from "../../shared/SidePanelHeader";

export function CurrentResourcesPanel({
  api,
  artifacts,
  onPreviewArtifact
}: {
  api: ArchAgentApi;
  artifacts: ArtifactSummary[];
  onPreviewArtifact: (artifactId: string) => void;
}): JSX.Element {
  return (
    <aside className="resource-sidebar current-resources-panel" aria-label="当前资源">
      <SidePanelHeader title="当前资源" icon={PackageOpen} meta={`${artifacts.length} 个会话资源`} />
      <ScrollArea.Root className="explorer-scroll">
        <ScrollArea.Viewport className="explorer-viewport">
          <div className="current-resource-list">
            {artifacts.length ? artifacts.map((artifact) => (
              <CurrentResourceRow
                api={api}
                artifact={artifact}
                key={artifact.id}
                onPreviewArtifact={onPreviewArtifact}
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
  artifact,
  onPreviewArtifact
}: {
  api: ArchAgentApi;
  artifact: ArtifactSummary;
  onPreviewArtifact: (artifactId: string) => void;
}): JSX.Element {
  const { Icon, className } = getWorkspaceFileIconSpec(artifact.name);
  return (
    <div className="current-resource-row">
      <button type="button" className="current-resource-main" onClick={() => onPreviewArtifact(artifact.id)}>
        <Icon size={16} className={className} />
        <span>
          <strong title={artifact.name}>{artifact.name}</strong>
          <small>{artifact.kind.toUpperCase()} · {formatBytes(artifact.size)}</small>
        </span>
      </button>
      <button
        type="button"
        className="current-resource-action"
        aria-label={`在系统中显示 ${artifact.name}`}
        title="在系统中显示"
        onClick={() => void api.artifact.reveal(artifact.id)}
      >
        <FolderOpen size={14} />
      </button>
      <button
        type="button"
        className="current-resource-action"
        aria-label={`打开 ${artifact.name}`}
        title="在系统中打开"
        onClick={() => void api.artifact.open(artifact.id)}
      >
        <ExternalLink size={14} />
      </button>
    </div>
  );
}
