/** Persistent workbench navigation and its project-level command menu. */
import type { JSX } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  ChevronRight,
  Files,
  Boxes,
  FolderOpen,
  FolderPlus,
  Menu,
  Plus,
  Settings,
  XCircle
} from "lucide-react";
import type { AppMetadata } from "../../../shared/types";
import { TooltipButton } from "../shared/TooltipButton";

export function ActivityBar({
  metadata,
  artifactCount,
  hasProject,
  onCreateConversation,
  onOpenProject,
  onCreateProject,
  onCloseProject,
  onOpenArtifacts,
  onOpenSettings,
  activeSection,
  onOpenExplorer,
  onOpenComponentLibrary
}: {
  metadata: AppMetadata;
  artifactCount: number;
  hasProject: boolean;
  onCreateConversation: () => void;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloseProject: () => void;
  onOpenArtifacts: () => void;
  onOpenSettings: () => void;
  activeSection?: "explorer" | "components";
  onOpenExplorer: () => void;
  onOpenComponentLibrary: () => void;
}): JSX.Element {
  return (
    <aside className="activity-bar" aria-label="主导航">
      <WorkbenchMenu
        label={metadata.displayName}
        hasProject={hasProject}
        onCreateConversation={onCreateConversation}
        onOpenProject={onOpenProject}
        onCreateProject={onCreateProject}
        onCloseProject={onCloseProject}
        onOpenArtifacts={onOpenArtifacts}
        onOpenSettings={onOpenSettings}
      />
      <nav className="activity-nav" aria-label="工作台导航">
        <TooltipButton label="资源管理器" className={activeSection === "explorer" ? "activity-button active" : "activity-button"} onClick={onOpenExplorer}>
          <Files size={20} />
        </TooltipButton>
        <TooltipButton label="构件库" className={activeSection === "components" ? "activity-button active" : "activity-button"} onClick={onOpenComponentLibrary}>
          <Boxes size={20} />
        </TooltipButton>
        <TooltipButton label="新建设计对话" className="activity-button" onClick={onCreateConversation}>
          <Plus size={20} />
        </TooltipButton>
        <TooltipButton label="产物历史" className="activity-button" onClick={onOpenArtifacts}>
          <FolderOpen size={20} />
          {artifactCount ? <span className="activity-badge">{artifactCount}</span> : null}
        </TooltipButton>
      </nav>
      <div className="activity-bottom">
        <TooltipButton label="运行设置" className="activity-button" onClick={onOpenSettings}>
          <Settings size={20} />
        </TooltipButton>
      </div>
    </aside>
  );
}

function WorkbenchMenu({
  label,
  hasProject,
  onCreateConversation,
  onOpenProject,
  onCreateProject,
  onCloseProject,
  onOpenArtifacts,
  onOpenSettings
}: {
  label: string;
  hasProject: boolean;
  onCreateConversation: () => void;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloseProject: () => void;
  onOpenArtifacts: () => void;
  onOpenSettings: () => void;
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
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="dropdown-item workbench-menu-trigger">
              文件
              <ChevronRight size={14} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="dropdown-content workbench-submenu" sideOffset={8} alignOffset={-4}>
                <DropdownMenu.Item className="dropdown-item" onSelect={onOpenProject}>
                  <FolderOpen size={14} />
                  打开项目…
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dropdown-item" onSelect={onCreateProject}>
                  <FolderPlus size={14} />
                  新建项目…
                </DropdownMenu.Item>
                {hasProject ? (
                  <DropdownMenu.Item className="dropdown-item" onSelect={onCloseProject}>
                    <XCircle size={14} />
                    关闭项目
                  </DropdownMenu.Item>
                ) : null}
                <DropdownMenu.Item className="dropdown-item" onSelect={onCreateConversation}>
                  <Plus size={14} />
                  新建设计会话
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dropdown-item" onSelect={onOpenArtifacts}>
                  <FolderOpen size={14} />
                  设计产物
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="dropdown-item workbench-menu-trigger">
              运行
              <ChevronRight size={14} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="dropdown-content workbench-submenu" sideOffset={8} alignOffset={-4}>
                <DropdownMenu.Item className="dropdown-item" onSelect={onOpenSettings}>
                  <Settings size={14} />
                  运行设置
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="dropdown-item workbench-menu-trigger">
              查看
              <ChevronRight size={14} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="dropdown-content workbench-submenu" sideOffset={8} alignOffset={-4}>
                <DropdownMenu.Item className="dropdown-item" onSelect={onOpenArtifacts}>
                  <Files size={14} />
                  查看文件资源
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="dropdown-item workbench-menu-trigger">
              帮助
              <ChevronRight size={14} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="dropdown-content workbench-submenu" sideOffset={8} alignOffset={-4}>
                <DropdownMenu.Item className="dropdown-item" onSelect={onOpenSettings}>
                  <Settings size={14} />
                  查看配置
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
