/** Entry screen for opening, creating, or resuming an ArchAgent project. */
import type { JSX } from "react";
import { ArrowRight, Files, FolderOpen, FolderPlus, Settings } from "lucide-react";
import appIconUrl from "../../../../../build/icon.png";
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
        <section className="project-picker-hero" aria-labelledby="project-picker-title">
          <div className="project-picker-brand">
            <img src={appIconUrl} alt="ArchAgent 标志" className="project-picker-logo" />
            <h1 id="project-picker-title">{props.metadata.displayName}</h1>
          </div>
        </section>

        <section className="project-picker-workspace" aria-label="项目入口">
          <div className="project-picker-workspace-heading">
            <h2>项目</h2>
          </div>

          <div className="project-picker-actions">
            <button type="button" className="primary-action" onClick={props.onCreateProject}>
              <FolderPlus size={18} />
              <span>新建项目</span>
              <ArrowRight size={16} className="project-picker-action-arrow" aria-hidden="true" />
            </button>
            <button type="button" className="secondary-action" onClick={props.onOpenProject}>
              <FolderOpen size={18} />
              打开已有项目
            </button>
          </div>

          {props.recentProjects.length ? (
            <div className="project-picker-recent">
              <div className="project-picker-section-heading">
                <span className="project-picker-recent-title">最近项目</span>
              </div>
              <ul>
                {props.recentProjects.map((project) => (
                  <li key={project.path}>
                    <button type="button" onClick={() => props.onSelectProject(project)} title={project.path}>
                      <span className="recent-project-icon" aria-hidden="true"><Files size={17} /></span>
                      <span className="recent-project-copy">
                        <span className="recent-project-name">{project.name}</span>
                        <span className="recent-project-path">{project.path}</span>
                      </span>
                      <ArrowRight size={16} className="recent-project-arrow" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="project-picker-empty-recent">
              <Files size={18} aria-hidden="true" />
              <span>暂无最近项目</span>
            </div>
          )}

          <div className="project-picker-footer">
            <button type="button" className="project-picker-link" onClick={props.onOpenSettings}>
              <Settings size={15} />
              运行设置
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
