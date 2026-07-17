/** Renders only built-in components that have a complete scene-command workflow. */
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useEffect, useState, type JSX } from "react";
import type { ArchAgentApi, GlobalComponentSummary } from "../../../../../shared/types";
import type { BuiltInComponentId } from "./componentLibraryContracts";
import { BuiltInComponentPreview } from "./BuiltInComponentPreview";
import { ComponentModelPreview } from "./ComponentModelPreview";
import { WorkspaceSidePanel } from "./WorkspaceSidePanel";

const AVAILABLE_COMPONENTS: Array<{
  id: BuiltInComponentId;
  label: string;
  description: string;
}> = [
  { id: "wall", label: "墙体", description: "参数创建" },
  { id: "slab", label: "楼板", description: "矩形参数创建" },
  { id: "ceiling", label: "天花", description: "矩形参数创建" },
  { id: "column", label: "柱", description: "结构支撑" },
  { id: "zone", label: "房间", description: "功能分区" },
  { id: "stair", label: "楼梯", description: "直梯参数创建" },
  { id: "fence", label: "围栏", description: "原生边界构件" },
  { id: "door", label: "门", description: "绑定墙体开洞" },
  { id: "window", label: "窗", description: "绑定墙体开洞" }
];

export const ComponentLibraryPanel = memo(function ComponentLibraryPanel({
  api, onSelectComponent, onPlaceComponent
}: {
  api: ArchAgentApi;
  onSelectComponent: (componentId: BuiltInComponentId) => void;
  onPlaceComponent: (id: string) => void;
}): JSX.Element {
  const [assets, setAssets] = useState<GlobalComponentSummary[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<GlobalComponentSummary>();
  const [structureOpen, setStructureOpen] = useState(true);
  const [customOpen, setCustomOpen] = useState(true);
  useEffect(() => {
    let active = true;
    const refreshAssets = (): void => {
      void api.componentLibrary.list().then((nextAssets) => {
        if (active) setAssets(nextAssets);
      });
    };

    refreshAssets();
    return api.events.subscribe((event) => {
      // Asset generation publishes an artifact event after its GLB reaches disk.
      if (event.type === "artifact.created") refreshAssets();
      if (
        event.type === "stream.item.updated" &&
        event.payload.kind === "tool" &&
        event.payload.toolName === "import_component_asset" &&
        event.payload.status === "success"
      ) {
        refreshAssets();
      }
    });
  }, [api]);
  return (
    <WorkspaceSidePanel label="构件库" className="component-library-sidebar">
      <section className={`component-library-section${structureOpen ? " is-open" : ""}`}>
        <button type="button" className="component-library-heading" aria-controls="structure-components" aria-expanded={structureOpen} onClick={() => setStructureOpen((open) => !open)}>
          {structureOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>建筑结构</span>
        </button>
        {structureOpen ? <div id="structure-components" className="component-library-list">
          <div className="component-library-grid">
            {AVAILABLE_COMPONENTS.map((component) => (
              <ComponentLibraryItem key={component.id} component={component} onSelectComponent={onSelectComponent} />
            ))}
          </div>
        </div> : null}
      </section>
      <section className={`component-library-section${customOpen ? " is-open" : ""}`}>
        <button type="button" className="component-library-heading" aria-controls="custom-components" aria-expanded={customOpen} onClick={() => setCustomOpen((open) => !open)}>
          {customOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>我的构件</span>
        </button>
        {customOpen ? <div id="custom-components" className="component-library-list">
          <div className="component-library-grid">
            {assets.map((asset) => (
              <button key={asset.id} type="button" className="component-library-item" onClick={() => setSelectedAsset(asset)} aria-label={`编辑构件 ${asset.name}`}>
                <ComponentModelPreview api={api} assetId={asset.id} label={asset.name} />
                <div className="component-library-item-copy">
                  <span>{asset.name}</span>
                  <small>{asset.category || asset.prompt || asset.model}</small>
                </div>
              </button>
            ))}
            {!assets.length ? <p className="component-library-note">通过 Agent 调用混元生3D生成的模型会显示在这里。</p> : null}
          </div>
        </div> : null}
        {customOpen && selectedAsset ? <ComponentSemanticEditor asset={selectedAsset} api={api} onSaved={(next) => { setAssets((current) => current.map((item) => item.id === next.id ? next : item)); setSelectedAsset(next); }} onPlace={() => onPlaceComponent(selectedAsset.id)} /> : null}
      </section>
      <p className="component-library-note">门窗均绑定墙体并经过洞口重叠校验，确保建筑关系始终可验证。</p>
    </WorkspaceSidePanel>
  );
});

function ComponentLibraryItem({
  component,
  onSelectComponent
}: {
  component: (typeof AVAILABLE_COMPONENTS)[number];
  onSelectComponent: (componentId: BuiltInComponentId) => void;
}): JSX.Element {
  return (
    <button type="button" className="component-library-item" onClick={() => onSelectComponent(component.id)}>
      <BuiltInComponentPreview componentId={component.id} />
      <div className="component-library-item-copy">
        <span>{component.label}</span>
        <small>{component.description}</small>
      </div>
    </button>
  );
}

function ComponentSemanticEditor({
  asset,
  api,
  onSaved,
  onPlace
}: {
  asset: GlobalComponentSummary;
  api: ArchAgentApi;
  onSaved: (asset: GlobalComponentSummary) => void;
  onPlace: () => void;
}): JSX.Element {
  const [name, setName] = useState(asset.name);
  const [description, setDescription] = useState(asset.description ?? "");
  const [category, setCategory] = useState(asset.category ?? "未分类");
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [placementRule, setPlacementRule] = useState(asset.placementRule ?? "");

  useEffect(() => {
    setName(asset.name);
    setDescription(asset.description ?? "");
    setCategory(asset.category ?? "未分类");
    setTags(asset.tags.join(", "));
    setPlacementRule(asset.placementRule ?? "");
  }, [asset]);

  const saveSemanticData = (): void => {
    void api.componentLibrary.update(asset.id, {
      name,
      description,
      category,
      tags: tags.split(","),
      placementRule
    }).then(onSaved);
  };

  return (
    <div className="component-semantic-editor">
      <input aria-label="构件名称" value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label="构件分类" value={category} onChange={(event) => setCategory(event.target.value)} />
      <input aria-label="构件标签" value={tags} placeholder="标签用逗号分隔" onChange={(event) => setTags(event.target.value)} />
      <textarea aria-label="构件描述" value={description} placeholder="说明构件的功能与可编辑语义" onChange={(event) => setDescription(event.target.value)} />
      <textarea aria-label="放置规则" value={placementRule} placeholder="例如：放置在地面，靠近墙体" onChange={(event) => setPlacementRule(event.target.value)} />
      <div>
        <button type="button" className="secondary-action" onClick={saveSemanticData}>保存语义</button>
        <button type="button" className="primary-action" onClick={onPlace}>放入场景</button>
      </div>
    </div>
  );
}
