/** Persistent workbench navigation and its project-level command menu. */
import type { JSX } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  Files,
  FolderOpen,
  FolderPlus,
  Github,
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
          <Github size={20} />
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
