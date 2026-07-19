/** Renders only built-in components that have a complete scene-command workflow. */
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronRight, Library, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [editingAsset, setEditingAsset] = useState<GlobalComponentSummary>();
  const [assetPendingDelete, setAssetPendingDelete] = useState<GlobalComponentSummary>();
  const [libraryMessage, setLibraryMessage] = useState("");
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
        event.type === "agent.tool.completed" &&
        event.payload.kind === "tool" &&
        event.payload.toolName === "import_component_asset" &&
        event.payload.status === "success"
      ) {
        refreshAssets();
      }
    });
  }, [api]);
  return (
    <WorkspaceSidePanel label="构件库" title="构件库" icon={Library} className="component-library-sidebar">
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
            {assets.map((asset) => <PersonalComponentCard key={asset.id} asset={asset} api={api} selected={selectedAsset?.id === asset.id} onSelect={() => setSelectedAsset(asset)} onEdit={() => setEditingAsset(asset)} onPlace={() => onPlaceComponent(asset.id)} onDelete={() => setAssetPendingDelete(asset)} />)}
            {!assets.length ? <p className="component-library-note">通过 Agent 调用混元生3D生成的模型会显示在这里。</p> : null}
          </div>
        </div> : null}
      </section>
      {libraryMessage ? <p className="component-library-error" role="alert">{libraryMessage}</p> : null}
      <ComponentSemanticDialog asset={editingAsset} api={api} onOpenChange={(open) => { if (!open) setEditingAsset(undefined); }} onSaved={(next) => { setAssets((current) => current.map((item) => item.id === next.id ? next : item)); setSelectedAsset(next); setEditingAsset(undefined); }} onPlace={() => { if (editingAsset) onPlaceComponent(editingAsset.id); }} />
      <DeleteComponentDialog asset={assetPendingDelete} onOpenChange={(open) => { if (!open) setAssetPendingDelete(undefined); }} onDelete={() => {
        const asset = assetPendingDelete;
        if (!asset) return;
        void api.componentLibrary.delete(asset.id)
          .then(() => {
            setAssets((current) => current.filter((item) => item.id !== asset.id));
            if (selectedAsset?.id === asset.id) setSelectedAsset(undefined);
            setAssetPendingDelete(undefined);
          })
          .catch((error: unknown) => setLibraryMessage(error instanceof Error ? error.message : String(error)));
      }} />
    </WorkspaceSidePanel>
  );
});

function PersonalComponentCard({
  asset,
  api,
  selected,
  onSelect,
  onEdit,
  onPlace,
  onDelete
}: {
  asset: GlobalComponentSummary;
  api: ArchAgentApi;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onPlace: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <article className={`component-library-item personal-component-card${selected ? " selected" : ""}`}>
      <button type="button" className="personal-component-main" onClick={onSelect} aria-label={`选中构件 ${asset.name}`}>
        <ComponentModelPreview api={api} assetId={asset.id} label={asset.name} />
        <div className="component-library-item-copy">
          <span>{asset.name}</span>
          <small>{asset.category || asset.prompt || asset.model}</small>
        </div>
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="component-card-more" aria-label={`管理构件 ${asset.name}`}><MoreHorizontal size={17} /></button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="dropdown-content component-card-menu" align="end" sideOffset={6}>
            <DropdownMenu.Item className="dropdown-item" onSelect={onPlace}><Plus size={14} />放入场景</DropdownMenu.Item>
            <DropdownMenu.Item className="dropdown-item" onSelect={onEdit}><Pencil size={14} />编辑语义</DropdownMenu.Item>
            <DropdownMenu.Separator className="dropdown-separator" />
            <DropdownMenu.Item className="dropdown-item danger" onSelect={onDelete}><Trash2 size={14} />删除构件</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </article>
  );
}

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

function ComponentSemanticDialog({
  asset,
  api,
  onSaved,
  onPlace,
  onOpenChange
}: {
  asset?: GlobalComponentSummary;
  api: ArchAgentApi;
  onSaved: (asset: GlobalComponentSummary) => void;
  onPlace: () => void;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  if (!asset) return <></>;
  return (
    <Dialog.Root open={Boolean(asset)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" />
        <Dialog.Content className="modal-panel component-semantic-dialog" aria-describedby="component-semantic-description">
          <Dialog.Title>编辑构件语义</Dialog.Title>
          <Dialog.Description id="component-semantic-description">补充构件的名称、分类、用途与放置规则，供 Agent 理解和调用。</Dialog.Description>
          <ComponentSemanticEditor asset={asset} api={api} onSaved={onSaved} onPlace={onPlace} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

function DeleteComponentDialog({ asset, onOpenChange, onDelete }: { asset?: GlobalComponentSummary; onOpenChange: (open: boolean) => void; onDelete: () => void }): JSX.Element {
  return (
    <AlertDialog.Root open={Boolean(asset)} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-backdrop" />
        <AlertDialog.Content className="modal-panel delete-panel">
          <AlertDialog.Title>删除构件？</AlertDialog.Title>
          <AlertDialog.Description>将永久删除“{asset?.name}”的模型、语义信息和预览图，已放入场景的实例不会被删除。</AlertDialog.Description>
          <footer>
            <AlertDialog.Cancel asChild><button type="button" className="secondary-action">取消</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button type="button" className="danger-action" onClick={onDelete}>删除构件</button></AlertDialog.Action>
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
