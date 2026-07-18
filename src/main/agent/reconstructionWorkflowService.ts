/** Owns explicit user approval and an Agent-readable atomic reconstruction plan. */
import type {
  AnswerWorkflowQuestionInput,
  ChatSession,
  ConfirmWorkflowInput,
  RetryWorkflowAssetInput,
  ReconstructionWorkflow,
  ReconstructionWorkflowAsset
} from "../../shared/types";
import type { RendererEvent } from "../../shared/types";
import { assertSingleEntityAsset } from "../modeling3d/hunyuan3dService";
import { listGlobalComponents } from "../modeling3d/componentLibraryService";

export interface CreateReconstructionWorkflowInput {
  mode: ReconstructionWorkflow["mode"];
  title: string;
  summary: string;
  assumptions?: string[];
  sourceResourceIds?: string[];
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
    sourceResourceId?: string;
    imagePath?: string;
    prompt?: string;
  placement?: ReconstructionWorkflowAsset["placement"];
  placements?: ReconstructionWorkflowAsset["placements"];
  }>;
}

export interface ReconstructionWorkflowService {
  createPlan(sessionId: string, input: CreateReconstructionWorkflowInput): ReconstructionWorkflow;
  answer(input: AnswerWorkflowQuestionInput): ReconstructionWorkflow;
  confirm(input: ConfirmWorkflowInput): ReconstructionWorkflow;
  cancel(input: Pick<ConfirmWorkflowInput, "sessionId" | "workflowId">): ReconstructionWorkflow;
  retry(input: RetryWorkflowAssetInput): ReconstructionWorkflow;
}

export function createReconstructionWorkflowService(options: {
  rootDir: string;
  sessions: Map<string, ChatSession>;
  createId: (prefix: string) => string;
  now: () => string;
  schedulePersistState: () => void;
  sendEvent: (event: RendererEvent) => void;
  confirmResourceLinks?: (input: { sessionId: string; resourceIds: string[] }) => void;
}): ReconstructionWorkflowService {

  function createPlan(sessionId: string, input: CreateReconstructionWorkflowInput): ReconstructionWorkflow {
    const session = requireSession(sessionId);
    validatePlan(input);
    const libraryIds = new Set(listGlobalComponents(options.rootDir).map((component) => component.id));
    for (const asset of input.assets) {
      if (asset.source === "library" && asset.componentId!.startsWith("lib_") && !libraryIds.has(asset.componentId!)) {
        throw new Error(`复用资产“${asset.name}”不在当前资产库中，请先重新搜索资产库。`);
      }
    }
    const priorRevision = session.workflow?.revision ?? 0;
    const createdAt = options.now();
    const workflow: ReconstructionWorkflow = {
      id: options.createId("workflow"),
      revision: priorRevision + 1,
      mode: input.mode,
      title: input.title.trim(),
      summary: input.summary.trim(),
      assumptions: input.assumptions?.map((item) => item.trim()).filter(Boolean) ?? [],
      sourceResourceIds: input.sourceResourceIds?.filter(Boolean) ?? [],
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
        ...(asset.sourceResourceId?.trim() ? { sourceResourceId: asset.sourceResourceId.trim() } : {}),
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
    workflow.status = "confirmed";
    workflow.confirmedAt = options.now();
    workflow.updatedAt = workflow.confirmedAt;
    options.confirmResourceLinks?.({ sessionId: input.sessionId, resourceIds: workflow.sourceResourceIds });
    persist(session);
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

  function retry(input: RetryWorkflowAssetInput): ReconstructionWorkflow {
    const session = requireSession(input.sessionId);
    const workflow = requireWorkflow(session, input.workflowId);
    ensureRevision(workflow, input.revision);
    throw new Error("重建计划不再后台执行；请让 Agent 使用公开生成工具重试该原子资产。");
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

  return { createPlan, answer, confirm, cancel, retry };
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
    assertSingleEntityAsset(asset.name, asset.source === "text" ? asset.prompt : undefined);
  }
}

function hasUnansweredRequiredQuestions(questions: NonNullable<CreateReconstructionWorkflowInput["questions"]>): boolean {
  return questions.some((question) => question.required !== false);
}
