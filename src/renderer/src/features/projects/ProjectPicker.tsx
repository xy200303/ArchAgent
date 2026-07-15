/** Entry screen for opening, creating, or resuming an ArchAgent project. */
import type { JSX } from "react";
import { Bot, Files, FolderOpen, FolderPlus, Settings } from "lucide-react";
import type { AppMetadata, ProjectInfo } from "../../../../shared/types";

export function ProjectPicker(props: {
  metadata: AppMetadata;
  recentProjects: ProjectInfo[];
  onOpenProject: () => void;
  onCreateProject: () => void;
  onSelectProject: (project: ProjectInfo) => void;
  onOpenSettings: () => void;
}): JSX.Element {
  return (
    <div className="project-picker">
      <div className="project-picker-card">
        <div className="project-picker-brand">
          <Bot size={30} />
          <div>
            <strong>{props.metadata.displayName}</strong>
            <span>每个项目拥有独立目录与会话列表，打开或新建一个项目开始空间设计</span>
          </div>
        </div>
        <div className="project-picker-actions">
          <button type="button" className="primary-action" onClick={props.onOpenProject}>
            <FolderOpen size={16} />
            打开项目…
          </button>
          <button type="button" className="secondary-action" onClick={props.onCreateProject}>
            <FolderPlus size={16} />
            新建项目…
          </button>
        </div>
        {props.recentProjects.length ? (
          <div className="project-picker-recent">
            <span className="project-picker-recent-title">最近项目</span>
            <ul>
              {props.recentProjects.map((project) => (
                <li key={project.path}>
                  <button type="button" onClick={() => props.onSelectProject(project)} title={project.path}>
                    <Files size={15} />
                    <span className="recent-project-name">{project.name}</span>
                    <span className="recent-project-path">{project.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="project-picker-footer">
          <button type="button" className="project-picker-link" onClick={props.onOpenSettings}>
            <Settings size={14} />
            运行设置
          </button>
        </div>
      </div>
    </div>
  );
}
