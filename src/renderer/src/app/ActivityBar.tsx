/** Persistent workbench navigation and its project-level command menu. */
import type { JSX } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  Files,
  FolderOpen,
  FolderPlus,
  Library,
  Menu,
  Network,
  PackageOpen,
  Settings,
  XCircle
} from "lucide-react";
import type { AppMetadata } from "../../../shared/types";
import { TooltipButton } from "../shared/TooltipButton";

export function ActivityBar({
  metadata,
  hasProject,
  onOpenProject,
  onCreateProject,
  onCloseProject,
  onRevealProject,
  onOpenSettings,
  activeSection,
  onOpenExplorer,
  onOpenResources,
  onOpenSceneNavigation,
  onOpenComponentLibrary
}: {
  metadata: AppMetadata;
  hasProject: boolean;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloseProject: () => void;
  onRevealProject: () => void;
  onOpenSettings: () => void;
  activeSection?: "explorer" | "resources" | "scene" | "components";
  onOpenExplorer: () => void;
  onOpenResources: () => void;
  onOpenSceneNavigation: () => void;
  onOpenComponentLibrary: () => void;
}): JSX.Element {
  return (
    <aside className="activity-bar" aria-label="主导航">
      <WorkbenchMenu
        label={metadata.displayName}
        hasProject={hasProject}
        onOpenProject={onOpenProject}
        onCreateProject={onCreateProject}
        onCloseProject={onCloseProject}
        onRevealProject={onRevealProject}
      />
      <nav className="activity-nav" aria-label="工作台导航">
        <TooltipButton label="场景节点" className={activeSection === "scene" ? "activity-button active" : "activity-button"} onClick={onOpenSceneNavigation}>
          <Network size={19} strokeWidth={1.8} />
        </TooltipButton>
        <TooltipButton label="资源管理器" className={activeSection === "explorer" ? "activity-button active" : "activity-button"} onClick={onOpenExplorer}>
          <Files size={20} />
        </TooltipButton>
        <TooltipButton label="当前资源" className={activeSection === "resources" ? "activity-button active" : "activity-button"} onClick={onOpenResources}>
          <PackageOpen size={19} strokeWidth={1.8} />
        </TooltipButton>
        <TooltipButton label="构件库" className={activeSection === "components" ? "activity-button active" : "activity-button"} onClick={onOpenComponentLibrary}>
          <Library size={18} strokeWidth={1.8} />
        </TooltipButton>
      </nav>
      <div className="activity-bottom">
        <TooltipButton label="在 GitHub 上查看 ArchAgent" className="activity-button" onClick={openArchAgentGitHub}>
          <GitHubMark />
        </TooltipButton>
        <TooltipButton label="运行设置" className="activity-button" onClick={onOpenSettings}>
          <Settings size={20} />
        </TooltipButton>
      </div>
    </aside>
  );
}

function openArchAgentGitHub(): void {
  void window.archAgent?.app.openArchAgentGitHub();
}

function GitHubMark(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.53.73.53 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}

function WorkbenchMenu({
  label,
  hasProject,
  onOpenProject,
  onCreateProject,
  onCloseProject,
  onRevealProject
}: {
  label: string;
  hasProject: boolean;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloseProject: () => void;
  onRevealProject: () => void;
}): JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="activity-menu-button"
          aria-label="打开工作台菜单"
          title={label}
        >
          <Menu size={20} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown-content workbench-menu-content" side="right" align="start" sideOffset={10}>
          <DropdownMenu.Item className="dropdown-item" onSelect={onOpenProject}>
            <FolderOpen size={14} />
            打开项目…
          </DropdownMenu.Item>
          <DropdownMenu.Item className="dropdown-item" onSelect={onCreateProject}>
            <FolderPlus size={14} />
            新建项目…
          </DropdownMenu.Item>
          {hasProject ? (
            <>
              <DropdownMenu.Separator className="workbench-menu-separator" />
              <DropdownMenu.Item className="dropdown-item" onSelect={onRevealProject}>
                <FolderOpen size={14} />
                在资源管理器中显示
              </DropdownMenu.Item>
              <DropdownMenu.Item className="dropdown-item" onSelect={onCloseProject}>
                <XCircle size={14} />
                关闭项目
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
