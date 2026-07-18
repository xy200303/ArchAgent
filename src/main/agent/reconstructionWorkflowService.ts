/** Owns explicit user approval and resumable execution for costly 3D reconstruction. */
import type {
  AnswerWorkflowQuestionInput,
  ChatSession,
  ConfirmWorkflowInput,
  ReconstructionWorkflow,
  ReconstructionWorkflowAsset,
  ReconstructionWorkflowPlacement
} from "../../shared/types";
import type { RendererEvent } from "../../shared/types";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { collectHunyuanGlb, submitHunyuan3dJob } from "../modeling3d/hunyuan3dService";
import { importGlobalComponent, listGlobalComponents } from "../modeling3d/componentLibraryService";
import type { SceneCommandResult } from "../../shared/modeling3d/sceneContracts";

export interface CreateReconstructionWorkflowInput {
  mode: ReconstructionWorkflow["mode"];
  title: string;
  summary: string;
  assumptions?: string[];
  sourceAttachmentIds?: string[];
  questions?: Array<{
    id: string;
    prompt: string;
    required?: boolean;
    options: Array<{ id: string; label: string; description?: string }>;
  }>;
  assets: Array<{
    id: string;
    name: string;
    quantity?: number;
    source: ReconstructionWorkflowAsset["source"];
    componentId?: string;
    imagePath?: string;
    prompt?: string;
    placement?: ReconstructionWorkflowPlacement;
    placements?: ReconstructionWorkflowPlacement[];
  }>;
}

export interface ReconstructionWorkflowService {
  createPlan(sessionId: string, input: CreateReconstructionWorkflowInput): ReconstructionWorkflow;
  answer(input: AnswerWorkflowQuestionInput): ReconstructionWorkflow;
  confirm(input: ConfirmWorkflowInput): ReconstructionWorkflow;
  cancel(input: Pick<ConfirmWorkflowInput, "sessionId" | "workflowId">): ReconstructionWorkflow;
  resumeAll(): void;
}

export function createReconstructionWorkflowService(options: {
  rootDir: string;
  sessions: Map<string, ChatSession>;
  getSessionOutputDir: (sessionId: string) => string;
  createId: (prefix: string) => string;
  now: () => string;
  schedulePersistState: () => void;
  sendEvent: (event: RendererEvent) => void;
  placeComponentLibraryItem: (input: {
    componentId: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }) => SceneCommandResult;
  maxConcurrentJobs?: number;
}): ReconstructionWorkflowService {
  const maxConcurrentJobs = Math.max(1, options.maxConcurrentJobs ?? 2);
  const activeJobs = new Set<string>();

  function createPlan(sessionId: string, input: CreateReconstructionWorkflowInput): ReconstructionWorkflow {
    const session = requireSession(sessionId);
    validatePlan(input);
    const priorRevision = session.workflow?.revision ?? 0;
    const createdAt = options.now();
    const workflow: ReconstructionWorkflow = {
      id: options.createId("workflow"),
      revision: priorRevision + 1,
      mode: input.mode,
      title: input.title.trim(),
      summary: input.summary.trim(),
      assumptions: input.assumptions?.map((item) => item.trim()).filter(Boolean) ?? [],
      sourceAttachmentIds: input.sourceAttachmentIds?.filter(Boolean) ?? [],
      questions: (input.questions ?? []).map((question) => ({
        id: question.id.trim(),
        prompt: question.prompt.trim(),
        required: question.required !== false,
        options: question.options.map((option) => ({
          id: option.id.trim(),
          label: option.label.trim(),
          ...(option.description?.trim() ? { description: option.description.trim() } : {})
        }))
      })),
      assets: input.assets.map((asset) => ({
        id: asset.id.trim(),
        name: asset.name.trim(),
        quantity: asset.quantity ?? 1,
        source: asset.source,
        ...(asset.componentId?.trim() ? { componentId: asset.componentId.trim() } : {}),
        ...(asset.imagePath?.trim() ? { imagePath: asset.imagePath.trim() } : {}),
        ...(asset.prompt?.trim() ? { prompt: asset.prompt.trim() } : {}),
        ...(asset.placement ? { placement: asset.placement } : {}),
        ...(asset.placements?.length ? { placements: asset.placements } : {}),
        status: "planned"
      })),
      status: hasUnansweredRequiredQuestions(input.questions ?? []) ? "needs_clarification" : "ready_for_confirmation",
      createdAt,
      updatedAt: createdAt
    };
    session.workflow = workflow;
    persist(session);
    return workflow;
  }

  function answer(input: AnswerWorkflowQuestionInput): ReconstructionWorkflow {
    const session = requireSession(input.sessionId);
    const workflow = requireWorkflow(session, input.workflowId);
    ensureRevision(workflow, input.revision);
    if (workflow.status !== "needs_clarification" && workflow.status !== "ready_for_confirmation") {
      throw new Error("当前计划已经开始生成，不能再修改选项。请创建新的方案版本。");
    }
    const question = workflow.questions.find((item) => item.id === input.questionId);
    if (!question) throw new Error("未找到待回答的问题。");
    if (!question.options.some((option) => option.id === input.optionId)) throw new Error("所选选项不属于当前问题。");
    question.selectedOptionId = input.optionId;
    workflow.status = workflow.questions.some((item) => item.required && !item.selectedOptionId)
      ? "needs_clarification"
      : "ready_for_confirmation";
    workflow.updatedAt = options.now();
    persist(session);
    return workflow;
  }

  function confirm(input: ConfirmWorkflowInput): ReconstructionWorkflow {
    const session = requireSession(input.sessionId);
    const workflow = requireWorkflow(session, input.workflowId);
    ensureRevision(workflow, input.revision);
    if (workflow.status !== "ready_for_confirmation") {
      throw new Error(workflow.status === "needs_clarification" ? "请先回答所有必填问题，再确认生成。" : "当前方案不能确认生成。");
    }
    workflow.status = "generating";
    workflow.confirmedAt = options.now();
    workflow.updatedAt = workflow.confirmedAt;
    for (const asset of workflow.assets) asset.status = "queued";
    persist(session);
    queueMicrotask(() => pump(session.id, workflow.id, workflow.revision));
    return workflow;
  }

  function cancel(input: Pick<ConfirmWorkflowInput, "sessionId" | "workflowId">): ReconstructionWorkflow {
    const session = requireSession(input.sessionId);
    const workflow = requireWorkflow(session, input.workflowId);
    if (workflow.status === "completed") throw new Error("已完成的方案不能取消。");
    workflow.status = "cancelled";
    workflow.updatedAt = options.now();
    for (const asset of workflow.assets) {
      if (asset.status === "planned" || asset.status === "queued") asset.status = "cancelled";
    }
    persist(session);
    return workflow;
  }

  function pump(sessionId: string, workflowId: string, revision: number): void {
    const workflow = getActiveWorkflow(sessionId, workflowId, revision);
    if (!workflow) return;
    while (activeJobs.size < maxConcurrentJobs) {
      const asset = workflow.assets.find((item) => item.status === "queued");
      if (!asset) break;
      const jobKey = `${sessionId}:${workflow.id}:${asset.id}`;
      asset.status = "running";
      workflow.updatedAt = options.now();
      activeJobs.add(jobKey);
      persist(requireSession(sessionId));
      void runAsset(sessionId, workflow.id, revision, asset.id)
        .catch(() => undefined)
        .finally(() => {
          activeJobs.delete(jobKey);
          finishWorkflowIfReady(sessionId, workflowId, revision);
          pump(sessionId, workflowId, revision);
        });
    }
    finishWorkflowIfReady(sessionId, workflowId, revision);
  }

  async function runAsset(sessionId: string, workflowId: string, revision: number, assetId: string): Promise<void> {
    const workflow = getActiveWorkflow(sessionId, workflowId, revision);
    const asset = workflow?.assets.find((item) => item.id === assetId);
    if (!workflow || !asset || workflow.status !== "generating") return;
    try {
      let componentId = asset.componentId;
      if (asset.source === "image" || asset.source === "text") {
        const dedupeKey = asset.dedupeKey ?? await createAssetDedupeKey(asset);
        asset.dedupeKey = dedupeKey;
        const existing = listGlobalComponents(options.rootDir).find((component) => component.tags.includes(`workflow-source:${dedupeKey}`));
        if (existing) {
          componentId = existing.id;
        } else {
          const submitted = asset.providerJob ?? await submitHunyuan3dJob({
            name: asset.name,
            ...(asset.source === "image" ? { imageBase64: await readWorkflowImage(asset.imagePath!) } : { prompt: asset.prompt! }),
            generateType: "low_poly"
          });
          asset.providerJob = submitted;
          persist(requireSession(sessionId));
          const generated = await collectHunyuanGlb(submitted, { name: `${asset.name}-${asset.id}`, prompt: asset.prompt }, join(options.getSessionOutputDir(sessionId), "assets"));
          if (!getActiveWorkflow(sessionId, workflowId, revision)) return;
          const component = importGlobalComponent(options.rootDir, generated.path, {
            name: asset.name,
            description: asset.source === "text" ? asset.prompt : "由用户参考图生成的低模资产",
            category: "重建设计",
            tags: ["workflow", "low-poly", `workflow-source:${dedupeKey}`]
          });
          componentId = component.id;
        }
      }
      if (!componentId) throw new Error("资产缺少构件库 ID。");
      const sceneAssetIds: string[] = [];
      for (let index = 0; index < asset.quantity; index += 1) {
        const placed = options.placeComponentLibraryItem({ componentId, ...(asset.placements?.[index] ?? asset.placement) });
        if (!placed.accepted) throw new Error(placed.message);
        if (placed.command.type !== "asset.create") throw new Error("构件放置未返回参考模型节点。");
        sceneAssetIds.push(placed.command.id);
      }
      const active = getActiveWorkflow(sessionId, workflowId, revision)?.assets.find((item) => item.id === assetId);
      if (!active) return;
      active.componentIdResult = componentId;
      active.sceneAssetIds = sceneAssetIds;
      active.status = "placed";
      active.error = undefined;
      const current = requireSession(sessionId);
      current.workflow!.updatedAt = options.now();
      persist(current);
    } catch (error) {
      const active = getActiveWorkflow(sessionId, workflowId, revision)?.assets.find((item) => item.id === assetId);
      if (!active) return;
      active.status = "failed";
      active.error = error instanceof Error ? error.message : String(error);
      const current = requireSession(sessionId);
      current.workflow!.updatedAt = options.now();
      persist(current);
    }
  }

  function finishWorkflowIfReady(sessionId: string, workflowId: string, revision: number): void {
    const workflow = getActiveWorkflow(sessionId, workflowId, revision);
    if (!workflow || workflow.status !== "generating") return;
    if (workflow.assets.some((asset) => asset.status === "queued" || asset.status === "running")) return;
    workflow.status = workflow.assets.some((asset) => asset.status === "failed") ? "needs_attention" : "completed";
    workflow.updatedAt = options.now();
    persist(requireSession(sessionId));
  }

  function resumeAll(): void {
    for (const session of options.sessions.values()) {
      const workflow = session.workflow;
      if (!workflow || workflow.status !== "generating") continue;
      for (const asset of workflow.assets) {
        if (asset.status === "running") asset.status = "queued";
      }
      workflow.updatedAt = options.now();
      persist(session);
      queueMicrotask(() => pump(session.id, workflow.id, workflow.revision));
    }
  }

  function getActiveWorkflow(sessionId: string, workflowId: string, revision: number): ReconstructionWorkflow | undefined {
    const workflow = options.sessions.get(sessionId)?.workflow;
    return workflow?.id === workflowId && workflow.revision === revision && workflow.status !== "cancelled" ? workflow : undefined;
  }

  function persist(session: ChatSession): void {
    session.updatedAt = options.now();
    options.sessions.set(session.id, session);
    options.schedulePersistState();
    options.sendEvent({ id: options.createId("event"), type: "session.updated", payload: session });
  }

  function requireSession(sessionId: string): ChatSession {
    const session = options.sessions.get(sessionId);
    if (!session) throw new Error("未找到会话。");
    return session;
  }

  function requireWorkflow(session: ChatSession, workflowId: string): ReconstructionWorkflow {
    if (!session.workflow || session.workflow.id !== workflowId) throw new Error("方案已经更新，请按当前版本操作。");
    return session.workflow;
  }

  function ensureRevision(workflow: ReconstructionWorkflow, revision: number): void {
    if (workflow.revision !== revision) throw new Error("方案版本已变化，请重新确认。");
  }

  return { createPlan, answer, confirm, cancel, resumeAll };
}

function validatePlan(input: CreateReconstructionWorkflowInput): void {
  if (!input.title.trim() || !input.summary.trim()) throw new Error("方案必须包含标题和摘要。");
  if (!input.assets.length) throw new Error("方案至少需要一个待复用或生成的资产。");
  const ids = new Set<string>();
  for (const asset of input.assets) {
    if (!asset.id.trim() || !asset.name.trim() || ids.has(asset.id)) throw new Error("资产 ID 必须唯一且名称不能为空。");
    ids.add(asset.id);
    if (!Number.isInteger(asset.quantity ?? 1) || (asset.quantity ?? 1) < 1) throw new Error("资产数量必须是正整数。");
    if (asset.placements?.length && asset.placements.length !== (asset.quantity ?? 1)) throw new Error(`资产“${asset.name}”的 placements 数量必须与 quantity 相同。`);
    if (asset.source === "library" && !asset.componentId?.trim()) throw new Error(`复用资产“${asset.name}”缺少 component_id。`);
    if (asset.source === "image" && !asset.imagePath?.trim()) throw new Error(`图生资产“${asset.name}”缺少 image_path。`);
    if (asset.source === "text" && !asset.prompt?.trim()) throw new Error(`文生资产“${asset.name}”缺少中文 prompt。`);
  }
}

function hasUnansweredRequiredQuestions(questions: NonNullable<CreateReconstructionWorkflowInput["questions"]>): boolean {
  return questions.some((question) => question.required !== false);
}

async function readWorkflowImage(path: string): Promise<string> {
  return (await readFile(path)).toString("base64");
}

async function createAssetDedupeKey(asset: ReconstructionWorkflowAsset): Promise<string> {
  const hash = createHash("sha256");
  hash.update("hy3-low-poly-v1\0");
  hash.update(asset.source);
  if (asset.source === "image") {
    hash.update(await readFile(asset.imagePath!));
  } else {
    hash.update(asset.prompt!);
  }
  return hash.digest("hex");
}
