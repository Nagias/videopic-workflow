import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import type { ProviderRegistry } from "../providers/types";
import type { RunDecision, RunScope } from "../shared/api";
import { stableStringify } from "../shared/hash";
import type { SourceRef } from "../shared/node-definition";
import { NodeOutputsSchema, type NodeOutputs, type PortValue } from "../shared/ports";
import { groupCombineId, groupEdited, rebuildWriterGroup, SCENES_EDITED_MESSAGE, writerGroups, writerWaits } from "../shared/scenes";
import { WorkflowGraphSchema, type WorkflowGraph, type WorkflowGroup, type WorkflowNode } from "../shared/workflow";
import type { Db } from "./db/client";
import { nodeCache, runNodes, runs } from "./db/schema";
import type { Ffmpeg } from "./ffmpeg";
import type { NodeInputs, ServerNode, StepValue } from "./node-runtime";
import { recordAsset } from "../features/assets/store";
import { getWorkflowRow, saveWorkflowGraph } from "../features/workflows/store";
import { collectMediaIds } from "./media-ids";
import { SERVICE_FAILURE_LIMIT } from "../shared/service-failure";
import { preflightErrors, type PreflightError } from "./preflight";
import { createRunShared, type ChatLocks } from "./run-shared";
import type { Storage } from "./storage";

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}

export type PlannedNode = {
  node: WorkflowNode;
  impl: ServerNode;
  params: unknown;
  // Mỗi cổng vào là một mảng dây; cổng thường luôn đúng 1 dây, cổng `multiple` có thể nhiều.
  inputs: Map<string, SourceRef[]>;
  // Phụ thuộc ngầm (không có dây): các Biên kịch phải xong trước, vì có thể tạo lại nhóm Phân cảnh chứa node này (writerWaits()).
  after: string[];
};

export type { SourceRef };
export { stableStringify };

// Số lần tạo (take) của node: càng cao càng là một lần tạo khác. Mặc định 1.
export function takeOf(params: unknown): number {
  const take = params && typeof params === "object" ? (params as { take?: unknown }).take : undefined;
  return typeof take === "number" && Number.isInteger(take) && take >= 1 ? take : 1;
}

// Thứ tự dây vào của một cổng nhiều dây: theo params.order (mã node nguồn) trước,
// phần còn lại theo toạ độ x rồi y của node nguồn (trái sang phải, trên xuống dưới).
export function orderSources(p: PlannedNode, name: string, graph: WorkflowGraph): SourceRef[] {
  const sources = p.inputs.get(name) ?? [];
  const rawOrder = p.params && typeof p.params === "object" ? (p.params as { order?: unknown }).order : undefined;
  const order = Array.isArray(rawOrder) ? rawOrder.filter((x): x is string => typeof x === "string") : [];
  const pos = new Map(graph.nodes.map((n) => [n.id, n.position]));
  const rank = (s: SourceRef) => {
    const i = order.indexOf(s.source);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...sources].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra !== Number.POSITIVE_INFINITY) return 0;
    const pa = pos.get(a.source);
    const pb = pos.get(b.source);
    return (pa?.x ?? 0) - (pb?.x ?? 0) || (pa?.y ?? 0) - (pb?.y ?? 0);
  });
}

export type ExecuteDeps = {
  db: Db;
  storage: Storage;
  ffmpeg: Ffmpeg;
  providers: ProviderRegistry;
  nodes: Record<string, ServerNode>;
  chatLocks: ChatLocks;
};

function zodMessage(err: ZodError): string {
  return err.issues.map((i) => i.message).join("; ");
}

export function planGraph(graph: WorkflowGraph, nodes: Record<string, ServerNode>): PlannedNode[] {
  const byId = new Map<string, WorkflowNode>();
  for (const n of graph.nodes) {
    if (byId.has(n.id)) throw new GraphError(`Trùng mã node "${n.id}"`);
    if (!nodes[n.type]) throw new GraphError(`Loại node "${n.type}" không tồn tại`);
    byId.set(n.id, n);
  }

  const waits = writerWaits(graph);
  const planned = new Map<string, PlannedNode>();
  for (const n of graph.nodes) {
    const impl = nodes[n.type]!;
    let params: unknown;
    try {
      params = impl.parseParams(n.params);
    } catch (err) {
      if (err instanceof ZodError) throw new GraphError(`Node "${impl.definition.label}" (${n.id}): ${zodMessage(err)}`);
      throw err;
    }
    planned.set(n.id, { node: n, impl, params, inputs: new Map(), after: waits.get(n.id) ?? [] });
  }

  for (const e of graph.edges) {
    const src = planned.get(e.source);
    const dst = planned.get(e.target);
    if (!src || !dst) throw new GraphError(`Dây nối "${e.id}" trỏ tới node không tồn tại`);
    const out = src.impl.definition.outputs.find((p) => p.name === e.sourceHandle);
    const inp = dst.impl.definition.inputs.find((p) => p.name === e.targetHandle);
    if (!out) throw new GraphError(`Node "${src.impl.definition.label}" không có cổng ra "${e.sourceHandle}"`);
    if (!inp) throw new GraphError(`Node "${dst.impl.definition.label}" không có cổng vào "${e.targetHandle}"`);
    if (out.kind !== inp.kind) {
      throw new GraphError(`Nối sai kiểu: "${src.impl.definition.label}.${out.label}" (${out.kind}) → "${dst.impl.definition.label}.${inp.label}" (${inp.kind})`);
    }
    const wires = dst.inputs.get(e.targetHandle) ?? [];
    if (wires.length > 0 && !inp.multiple) throw new GraphError(`Cổng "${inp.label}" của node "${dst.impl.definition.label}" có nhiều hơn một dây nối`);
    dst.inputs.set(e.targetHandle, [...wires, { source: e.source, sourceHandle: e.sourceHandle }]);
  }

  for (const p of planned.values()) {
    for (const inp of p.impl.definition.inputs) {
      if (!p.inputs.has(inp.name) && !inp.optional) throw new GraphError(`Node "${p.impl.definition.label}" (${p.node.id}) chưa nối cổng vào "${inp.label}"`);
    }
  }

  const order: PlannedNode[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string) => {
    const s = state.get(id);
    if (s === "done") return;
    if (s === "visiting") throw new GraphError("Workflow có vòng lặp (node nối ngược về chính nó)");
    state.set(id, "visiting");
    const p = planned.get(id)!;
    for (const src of sourcesOf(p)) visit(src);
    state.set(id, "done");
    order.push(p);
  };
  for (const n of graph.nodes) visit(n.id);
  return order;
}

// take = 1 là lần tạo mặc định nên không đưa vào khoá: kết quả đã có từ trước khi có take vẫn dùng lại được.
function withoutDefaultTake(params: unknown): unknown {
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;
  if ((params as { take?: unknown }).take !== 1) return params;
  const rest = { ...(params as Record<string, unknown>) };
  delete rest.take;
  return rest;
}

export function cacheKeyOf(type: string, params: unknown, upstream: Record<string, string>, version?: string): string {
  const keyParams = withoutDefaultTake(params);
  const parts = version === undefined ? { type, params: keyParams, upstream } : { type, params: keyParams, upstream, version };
  return createHash("sha256").update(stableStringify(parts)).digest("hex");
}

// Khoá cache của node: loại, tham số, khoá các node nguồn theo từng cổng (cổng nhiều dây theo đúng thứ tự orderSources()).
// keyOf trả khoá của node nguồn (đã tính trước, vì order xếp nguồn trước đích).
export function nodeKeyOf(p: PlannedNode, graph: WorkflowGraph, keyOf: (nodeId: string) => string | undefined): string {
  const upstream: Record<string, string> = {};
  for (const port of p.impl.definition.inputs) {
    if (!p.inputs.has(port.name)) continue;
    const wires = port.multiple ? orderSources(p, port.name, graph) : p.inputs.get(port.name)!;
    upstream[port.name] = wires.map((src) => `${keyOf(src.source)}:${src.sourceHandle}`).join(",");
  }
  return cacheKeyOf(p.node.type, p.params, upstream, p.impl.definition.cacheVersion);
}

// Khoá cache của mọi node theo thứ tự chạy: khoá chỉ phụ thuộc tham số và khoá nguồn nên tính được trước khi chạy (ước tính lượt).
export function computeKeys(order: PlannedNode[], graph: WorkflowGraph): Map<string, string> {
  const keys = new Map<string, string>();
  for (const p of order) keys.set(p.node.id, nodeKeyOf(p, graph, (id) => keys.get(id)));
  return keys;
}

// Giá trị đầu vào của node từ kết quả các node nguồn. Cổng có dây chưa có giá trị thì vắng trong inputs, dây đó vào missing.
export function gatherInputs(p: PlannedNode, graph: WorkflowGraph, outputOf: (nodeId: string) => NodeOutputs | undefined): { inputs: NodeInputs; missing: SourceRef[] } {
  const inputs: NodeInputs = {};
  const missing: SourceRef[] = [];
  for (const port of p.impl.definition.inputs) {
    if (!p.inputs.has(port.name)) continue;
    const wires = port.multiple ? orderSources(p, port.name, graph) : p.inputs.get(port.name)!;
    const values: PortValue[] = [];
    for (const src of wires) {
      const value = outputOf(src.source)?.[src.sourceHandle];
      if (value) values.push(value);
      else missing.push(src);
    }
    if (values.length === wires.length) inputs[port.name] = port.multiple ? values : values[0]!;
  }
  return { inputs, missing };
}

// Khoá cache của bước con ctx.step: theo vùng (stepScope) và lần tạo (take > 1), không theo node.
export function stepKeyOf(stepScope: string, take: number, keyParts: unknown): string {
  const takePart = take > 1 ? `take${take}:` : "";
  return createHash("sha256").update(`step:${stepScope}:${takePart}${stableStringify(keyParts)}`).digest("hex");
}

export function mediaStillValid(value: unknown, storage: Storage): boolean {
  return collectMediaIds(value).every((id) => {
    const rec = storage.getMedia(id);
    return rec !== undefined && existsSync(storage.absPath(rec));
  });
}

export function outputsStillValid(outputs: NodeOutputs, storage: Storage): boolean {
  return Object.values(outputs).every((v: PortValue) => mediaStillValid(v, storage));
}

// Mọi node phải xong trước node này: nguồn của các dây vào, cộng phụ thuộc ngầm (after).
export function sourcesOf(p: PlannedNode): string[] {
  return [...[...p.inputs.values()].flat().map((w) => w.source), ...p.after];
}

// Các node thuộc phạm vi chạy. `node`: node đó và mọi node phía trước.
// `downstream`: node đó, mọi node phía sau, và mọi node phía trước của các node ấy.
export function scopeNodes(order: PlannedNode[], scope: RunScope): Set<string> {
  const byId = new Map(order.map((p) => [p.node.id, p]));
  if (scope.mode === "all") return new Set(byId.keys());
  if (!byId.has(scope.nodeId)) throw new GraphError(`Node "${scope.nodeId}" không có trong workflow`);

  const roots = new Set([scope.nodeId]);
  // order đã xếp nguồn trước đích nên một lượt đi xuôi là đủ gom mọi node phía sau.
  if (scope.mode === "downstream") for (const p of order) if (sourcesOf(p).some((s) => roots.has(s))) roots.add(p.node.id);

  const picked = new Set<string>();
  const pick = (id: string) => {
    if (picked.has(id)) return;
    picked.add(id);
    for (const s of sourcesOf(byId.get(id)!)) pick(s);
  };
  for (const id of roots) pick(id);
  return picked;
}

type NodeState = "pending" | "running" | "done" | "failed" | "skipped";

// Kết quả node đang chạy, cho node giống hệt chờ dùng lại. Không bao giờ reject: lỗi đi theo node gốc.
type TwinResult = { ok: true; json: string } | { ok: false; label: string };

// Node giống hệt node lỗi: không chạy lại, bị bỏ qua và nêu tên node lỗi.
class SkippedBecause extends Error {
  constructor(readonly culprit: string) {
    super(`Bỏ qua vì "${culprit}" lỗi`);
    this.name = "SkippedBecause";
  }
}

// Lập lịch: node nào đủ nguồn (đã xong hoặc dùng lại) thì chạy ngay; giới hạn chỉ nằm ở ctx.shared.slot theo dịch vụ.
export async function executeRun(
  deps: ExecuteDeps,
  runId: string,
  workflowId: string,
  graph: WorkflowGraph,
  signal: AbortSignal,
  scope: RunScope,
): Promise<void> {
  const { db } = deps;
  const now = () => Date.now();
  const setNode = (nodeId: string, patch: Partial<typeof runNodes.$inferInsert>) =>
    db.update(runNodes).set({ ...patch, updatedAt: now() }).where(and(eq(runNodes.runId, runId), eq(runNodes.nodeId, nodeId))).run();
  const addRow = (nodeId: string) => db.insert(runNodes).values({ runId, nodeId, status: "pending", updatedAt: now() }).onConflictDoNothing().run();

  // Đồ thị của lần chạy: đổi giữa chừng khi Biên kịch tạo lại nhóm Phân cảnh (regroup bên dưới).
  let current = graph;
  let order: PlannedNode[];
  let plan: PlannedNode[];
  try {
    order = planGraph(current, deps.nodes);
    const inScope = scopeNodes(order, scope);
    plan = order.filter((p) => inScope.has(p.node.id));
  } catch (err) {
    // Đồ thị hỏng: chỉ đánh dấu những node lần chạy này nhắm tới, node khác giữ nguyên kết quả cũ.
    const targets = scope.mode === "all" ? current.nodes.map((n) => n.id) : current.nodes.filter((n) => n.id === scope.nodeId).map((n) => n.id);
    for (const id of targets) {
      addRow(id);
      setNode(id, { status: "skipped" });
    }
    throw err;
  }
  for (const p of plan) addRow(p.node.id);

  // Kiểm luật trước khi tốn lượt trên các node chưa chạy: có lỗi thì không node nào trong số đó được khởi chạy.
  const preflightOf = (targets: PlannedNode[], ord: PlannedNode[] = order, g: WorkflowGraph = current) =>
    preflightErrors(targets, new Map(ord.map((p) => [p.node.id, p])), g, (p, port) => orderSources(p, port, g));
  const blockAll =(blocked: PreflightError[], targets: PlannedNode[], note: string): GraphError => {
    const culprits = new Set(blocked.map((e) => e.nodeId));
    for (const p of targets) {
      const own = blocked.filter((e) => e.nodeId === p.node.id).map((e) => e.message);
      const error = own.length > 0 ? own.join("; ") : `Bỏ qua vì kiểm luật trước khi chạy có lỗi ở ${[...culprits].map((id) => `"${id}"`).join(", ")}`;
      setNode(p.node.id, { status: "skipped", error, message: null });
    }
    return new GraphError(`Kiểm luật trước khi chạy: ${blocked.length} lỗi, ${note}. ${blocked.map((e) => e.message).join(" | ")}`);
  };
  // Cảnh của nhóm có Biên kịch trong lần chạy, Ghép phim của nhóm và mọi node phía sau: hoãn kiểm tới khi Biên kịch xong
  // (bộ cảnh cũ sắp bị thay thì không được chặn cả lần chạy). Chúng chờ Biên kịch nên chưa thể chạy trước lần kiểm đó.
  const inPlan = new Set(plan.map((p) => p.node.id));
  const deferred = new Set<string>();
  for (const p of plan) if (p.after.some((w) => inPlan.has(w)) || sourcesOf(p).some((s) => deferred.has(s))) deferred.add(p.node.id);
  const blocked = preflightOf(plan.filter((p) => !deferred.has(p.node.id)));
  if (blocked.length > 0) throw blockAll(blocked, plan, "chưa chạy node nào");

  const shared = createRunShared({ providers: deps.providers, chatLocks: deps.chatLocks, failureLimit: SERVICE_FAILURE_LIMIT });
  const outputs = new Map<string, NodeOutputs>();
  const keys = new Map<string, string>();
  const inflight = new Map<string, Promise<TwinResult>>();
  const remember = (p: PlannedNode, key: string, out: NodeOutputs) => {
    const kind = p.impl.definition.library;
    if (kind) recordAsset(db, { cacheKey: key, kind, params: p.params, outputs: out });
  };

  const runNode = async (p: PlannedNode): Promise<void> => {
    const id = p.node.id;
    const { inputs, missing } = gatherInputs(p, current, (nodeId) => outputs.get(nodeId));
    if (missing[0]) throw new Error(`Node nguồn "${missing[0].source}" không trả cổng "${missing[0].sourceHandle}"`);
    const take = takeOf(p.params);
    const stepScope = p.impl.definition.stepScope ?? p.node.type;
    const key = nodeKeyOf(p, current, (nodeId) => keys.get(nodeId));
    keys.set(id, key);

    // Node giống hệt (cùng khoá) đang chạy: chờ nó rồi dùng lại, không gọi dịch vụ lần hai.
    const twin = inflight.get(key);
    if (twin) {
      setNode(id, { status: "running", cacheKey: key, message: "Chờ node giống hệt đang chạy…", error: null });
      const done = await twin;
      if (!done.ok) throw new SkippedBecause(done.label);
      const parsed = NodeOutputsSchema.parse(JSON.parse(done.json));
      outputs.set(id, parsed);
      remember(p, key, parsed);
      setNode(id, { status: "cached", cacheKey: key, outputJson: done.json, message: "Dùng lại kết quả trước", error: null });
      return;
    }

    const cached = db.select().from(nodeCache).where(eq(nodeCache.cacheKey, key)).get();
    if (cached) {
      const parsed = NodeOutputsSchema.parse(JSON.parse(cached.outputJson));
      if (outputsStillValid(parsed, deps.storage)) {
        outputs.set(id, parsed);
        remember(p, key, parsed);
        setNode(id, { status: "cached", cacheKey: key, outputJson: cached.outputJson, message: "Dùng lại kết quả trước", error: null });
        return;
      }
      db.delete(nodeCache).where(eq(nodeCache.cacheKey, key)).run();
    }

    // Đăng ký trước lần await đầu tiên, để node giống hệt khởi chạy cùng lượt thấy ngay.
    let settle!: (r: TwinResult) => void;
    inflight.set(key, new Promise<TwinResult>((r) => (settle = r)));
    try {
      const json = await produce(p, id, key, inputs, take, stepScope);
      settle({ ok: true, json });
    } catch (err) {
      settle({ ok: false, label: p.impl.definition.label });
      throw err;
    } finally {
      inflight.delete(key);
    }
  };

  const produce = async (p: PlannedNode, id: string, key: string, inputs: NodeInputs, take: number, stepScope: string): Promise<string> => {
    setNode(id, { status: "running", cacheKey: key, message: "Đang chạy…", error: null });
    const result = await p.impl.run(
      {
        signal,
        report: (message) => setNode(id, { message }),
        partial: (partialOutputs) => setNode(id, { outputJson: JSON.stringify(NodeOutputsSchema.parse(partialOutputs)) }),
        step: async <T extends StepValue>(keyParts: unknown, fn: () => Promise<T>): Promise<T> => {
          const stepKey = stepKeyOf(stepScope, take, keyParts);
          const hit = db.select().from(nodeCache).where(eq(nodeCache.cacheKey, stepKey)).get();
          if (hit) {
            const value = JSON.parse(hit.outputJson) as T;
            if (mediaStillValid(value, deps.storage)) return value;
            db.delete(nodeCache).where(eq(nodeCache.cacheKey, stepKey)).run();
          }
          const value = await fn();
          db.insert(nodeCache).values({ cacheKey: stepKey, outputJson: JSON.stringify(value), createdAt: now() }).onConflictDoNothing().run();
          return value;
        },
        providers: deps.providers,
        storage: deps.storage,
        ffmpeg: deps.ffmpeg,
        shared,
      },
      inputs,
      p.params,
    );
    const json = JSON.stringify(NodeOutputsSchema.parse(result));
    db.insert(nodeCache).values({ cacheKey: key, outputJson: json, createdAt: now() }).onConflictDoNothing().run();
    outputs.set(id, result);
    remember(p, key, result);
    setNode(id, { status: "succeeded", outputJson: json, message: "Xong" });
    return json;
  };

  const state = new Map<string, NodeState>(plan.map((p) => [p.node.id, "pending"]));
  // Nhãn node lỗi gốc của mỗi node lỗi/bị bỏ qua, để báo đúng tên dù bị bỏ qua dây chuyền.
  const culprit = new Map<string, string>();
  const errors = new Map<string, unknown>();
  // Lỗi làm cả phần còn lại không chạy được (kiểm luật nhóm cảnh mới hỏng…): node chưa chạy bị bỏ qua, run lỗi khi node đang chạy xong.
  let fatal: Error | undefined;
  // Lần chạy dừng để hỏi (nhóm Phân cảnh đã sửa tay): chỉ nhóm đó và phía sau bị bỏ qua, node khác chạy tiếp.
  let decision: RunDecision | undefined;

  const skipPending = (targets: Iterable<string>, error: string, who: string) => {
    for (const id of targets) {
      if (state.get(id) !== "pending") continue;
      state.set(id, "skipped");
      culprit.set(id, who);
      setNode(id, { status: "skipped", error, message: null });
    }
  };

  // Nhận kế hoạch theo đồ thị mới (đã kiểm luật và đã lưu). Node chỉ có ở đồ thị cũ (cảnh bị bỏ) thì chưa chạy được
  // vì còn chờ Biên kịch, nên xoá dòng của nó khỏi lần chạy này; node mới thêm dòng.
  const adopt = (next: WorkflowGraph, nextOrder: PlannedNode[], nextPlan: PlannedNode[]) => {
    const kept = new Set(nextPlan.map((p) => p.node.id));
    for (const p of plan) {
      const id = p.node.id;
      if (kept.has(id) || state.get(id) !== "pending") continue;
      state.delete(id);
      db.delete(runNodes).where(and(eq(runNodes.runId, runId), eq(runNodes.nodeId, id))).run();
    }
    for (const p of nextPlan) {
      if (state.has(p.node.id)) continue;
      addRow(p.node.id);
      state.set(p.node.id, "pending");
    }
    current = next;
    order = nextOrder;
    plan = nextPlan;
  };

  // Biên kịch vừa xong (chạy hoặc dùng lại). Nhóm Phân cảnh sinh từ nó mà khác kết quả (resultKey):
  // - chưa sửa tay, cả trong đồ thị của run (lúc bấm Chạy) lẫn trong workflow đang lưu (Editor có thể đã lưu trong lúc
  //   Biên kịch viết): tạo lại nhóm ở cả hai, kiểm luật, rồi mới lưu workflow (bản trong db, giữ mọi sửa đổi khác) và đồ thị
  //   của run (chạy tiếp sau khi tắt máy dùng đúng đồ thị mới) trong một giao dịch; chạy tiếp trong cùng run;
  // - đã sửa tay ở một trong hai nơi (hoặc nhóm đã bị bỏ khỏi workflow): dừng hỏi, không ghi đè gì.
  // Kiểm luật các node còn chờ (cảnh mới, hoặc cảnh đã hoãn kiểm lúc bắt đầu) trước khi bất kỳ cảnh nào được chạy.
  // Lỗi thì ném ra: không lưu gì, node chưa chạy bị bỏ qua (xem chỗ gọi).
  const regroup = (writerId: string) => {
    const key = keys.get(writerId);
    const shots = outputs.get(writerId)?.shots;
    if (key === undefined || shots?.kind !== "shotlist") return;
    const stale = writerGroups(current, writerId).filter((g) => g.source?.resultKey !== key);
    let next = current;
    let stored: WorkflowGraph | undefined;
    const edited: WorkflowGroup[] = [];
    if (stale.length > 0) {
      const row = getWorkflowRow(db, workflowId);
      if (!row) throw new Error(`Không tìm thấy workflow "${workflowId}" (đã bị xoá?) — không lưu được thẻ cảnh mới của Biên kịch`);
      let inDb: WorkflowGraph = WorkflowGraphSchema.parse(JSON.parse(row.graphJson));
      for (const g of stale) {
        const there = writerGroups(inDb, writerId).some((x) => x.id === g.id);
        if (groupEdited(next, g.id) || !there || groupEdited(inDb, g.id)) {
          edited.push(g);
          continue;
        }
        const args = { writerId, groupId: g.id, shots: shots.shots, resultKey: key };
        next = rebuildWriterGroup(next, args).graph;
        inDb = rebuildWriterGroup(inDb, args).graph;
      }
      if (next !== current) stored = inDb;
    }

    let nextOrder = order;
    let nextPlan = plan;
    if (next !== current) {
      nextOrder = planGraph(next, deps.nodes);
      const inScope = scopeNodes(nextOrder, scope);
      nextPlan = nextOrder.filter((p) => inScope.has(p.node.id));
    }
    // Nhóm phải hỏi: cảnh, Ghép phim của nhóm và mọi node phía sau (order xếp nguồn trước đích nên đi xuôi một lượt là đủ).
    const held = new Set<string>();
    for (const g of edited) {
      for (const id of g.nodeIds) held.add(id);
      const combineId = groupCombineId(next, g.id);
      if (combineId !== undefined) held.add(combineId);
    }
    for (const p of nextOrder) if (sourcesOf(p).some((s) => held.has(s))) held.add(p.node.id);

    const waiting = nextPlan.filter((p) => (state.get(p.node.id) ?? "pending") === "pending" && !held.has(p.node.id));
    const problems = preflightOf(waiting, nextOrder, next);
    if (problems.length > 0) {
      const note = stored ? "chưa chạy cảnh nào của bộ cảnh mới, chưa lưu thẻ cảnh mới" : "chưa chạy cảnh nào của nhóm";
      throw new GraphError(`Kiểm luật trước khi chạy: ${problems.length} lỗi, ${note}. ${problems.map((e) => e.message).join(" | ")}`);
    }

    if (stored) {
      const saved = stored;
      db.transaction(() => {
        saveWorkflowGraph(db, workflowId, saved);
        db.update(runs).set({ graphJson: JSON.stringify(WorkflowGraphSchema.parse(next)) }).where(eq(runs.id, runId)).run();
      });
      adopt(next, nextOrder, nextPlan);
    }
    if (edited.length === 0) return;
    decision ??= { kind: "scenes-edited", writerId, groupId: edited[0]!.id };
    db.update(runs).set({ decisionJson: JSON.stringify(decision) }).where(eq(runs.id, runId)).run();
    skipPending(held, SCENES_EDITED_MESSAGE, order.find((p) => p.node.id === writerId)?.impl.definition.label ?? writerId);
  };

  await new Promise<void>((resolve, reject) => {
    let running = 0;
    const pump = () => {
      for (const p of plan) {
        const id = p.node.id;
        if (state.get(id) !== "pending") continue;
        const sources = sourcesOf(p);
        const broken = sources.find((s) => state.get(s) === "failed" || state.get(s) === "skipped");
        if (broken !== undefined) {
          const who = culprit.get(broken)!;
          state.set(id, "skipped");
          culprit.set(id, who);
          setNode(id, { status: "skipped", error: `Bỏ qua vì "${who}" lỗi`, message: null });
          continue;
        }
        if (fatal || signal.aborted || !sources.every((s) => state.get(s) === "done")) continue;
        state.set(id, "running");
        running++;
        runNode(p)
          .then(
            () => {
              state.set(id, "done");
              if (writerGroups(current, id).length === 0) return;
              try {
                regroup(id);
              } catch (err) {
                // Không tạo lại được nhóm hoặc cảnh không qua kiểm luật: chưa lưu gì, node chưa chạy dừng lại, run báo đúng lỗi này.
                fatal = err instanceof Error ? err : new Error(String(err));
                skipPending(plan.map((x) => x.node.id), `Bỏ qua: ${fatal.message}`, p.impl.definition.label);
              }
            },
            (err: unknown) => {
              if (err instanceof SkippedBecause) {
                state.set(id, "skipped");
                culprit.set(id, err.culprit);
                setNode(id, { status: "skipped", error: err.message, message: null });
                return;
              }
              state.set(id, "failed");
              culprit.set(id, p.impl.definition.label);
              errors.set(id, err);
              setNode(id, { status: "failed", error: err instanceof Error ? err.message : String(err), message: null });
            },
          )
          .then(() => {
            running--;
            pump();
          })
          .catch((err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
      }
      if (running === 0) resolve();
    };
    pump();
  });

  if (signal.aborted) {
    for (const p of plan) if (state.get(p.node.id) === "pending") setNode(p.node.id, { status: "skipped", error: "Bỏ qua vì lần chạy bị dừng", message: null });
    throw new Error("Run đã bị dừng");
  }
  if (fatal) throw fatal;
  const failed = plan.filter((p) => errors.has(p.node.id));
  const detail = failed.map((p) => {
    const err = errors.get(p.node.id);
    return `Node "${p.impl.definition.label}" lỗi: ${err instanceof Error ? err.message : String(err)}`;
  });
  const failure = failed.length > 0 ? `${failed.length} node lỗi. ${detail.join(" | ")}` : undefined;
  if (decision) throw new Error(failure ? `${SCENES_EDITED_MESSAGE} | ${failure}` : SCENES_EDITED_MESSAGE);
  if (failure) throw new Error(failure, { cause: errors.get(failed[0]!.node.id) });
}
