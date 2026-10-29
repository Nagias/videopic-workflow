import { eq } from "drizzle-orm";
import type { EstimateNode, EstimateResponse, RunScope } from "../shared/api";
import type { Calls, EstimateKnown } from "../shared/node-definition";
import { NodeOutputsSchema, type NodeOutputs } from "../shared/ports";
import { PROVIDER_IDS, type ProviderId } from "../shared/providers";
import { groupEdited, rebuildWriterGroup, writerGroups } from "../shared/scenes";
import type { WorkflowGraph } from "../shared/workflow";
import type { Db } from "./db/client";
import { nodeCache } from "./db/schema";
import {
  computeKeys,
  gatherInputs,
  mediaStillValid,
  outputsStillValid,
  planGraph,
  scopeNodes,
  sourcesOf,
  stepKeyOf,
  takeOf,
  type PlannedNode,
} from "./executor";
import { labelOf } from "./node-label";
import type { ServerNode } from "./node-runtime";
import type { Storage } from "./storage";

export type EstimateDeps = { db: Db; storage: Storage; nodes: Record<string, ServerNode> };

const ZERO: Calls = { image: 0, video: 0, text: 0 };
const add = (a: Calls, b: Calls): Calls => ({ image: a.image + b.image, video: a.video + b.video, text: a.text + b.text });
const isZero = (c: Calls) => c.image === 0 && c.video === 0 && c.text === 0;

function providerOf(params: unknown): ProviderId | null {
  const raw = params && typeof params === "object" ? (params as { provider?: unknown }).provider : undefined;
  return PROVIDER_IDS.find((id) => id === raw) ?? null;
}

// Ước tính lượt của một lần chạy (spec mục 6.5): không gọi dịch vụ, không ghi gì. Đi đúng đường executeRun():
// planGraph() → scopeNodes(), khoá node computeKeys(), khoá bước con stepKeyOf().
// - Node có cache (hoặc trùng khoá với node chạy trước nó trong lần chạy) → "cached", 0 lượt.
// - Node chạy → "run", estimate() của node với đầu vào đã biết (node phía trước có cache, hoặc chạy mà 0 lượt và có predict())
//   để node đếm đúng bước con còn thiếu cache; cổng chưa biết thì node ước theo tham số (ước dư).
// - "unknown": node chờ một node viết chữ sẽ chạy (Biên kịch: nhóm cảnh, Đồ vật nối từ nó), chờ node "unknown", estimate()
//   trả undefined, hoặc node có tham số provider mà không có estimate() — không bao giờ coi là 0 lượt.
export function estimateRun(deps: EstimateDeps, graph: WorkflowGraph, scope: RunScope): EstimateResponse {
  const cachedOutputs = (key: string): NodeOutputs | undefined => {
    const row = deps.db.select().from(nodeCache).where(eq(nodeCache.cacheKey, key)).get();
    if (!row) return undefined;
    const parsed = NodeOutputsSchema.parse(JSON.parse(row.outputJson));
    return outputsStillValid(parsed, deps.storage) ? parsed : undefined;
  };
  const stepOf =
    (p: PlannedNode) =>
    (keyParts: unknown): unknown => {
      const key = stepKeyOf(p.impl.definition.stepScope ?? p.node.type, takeOf(p.params), keyParts);
      const row = deps.db.select().from(nodeCache).where(eq(nodeCache.cacheKey, key)).get();
      if (!row) return undefined;
      const value: unknown = JSON.parse(row.outputJson);
      return mediaStillValid(value, deps.storage) ? value : undefined;
    };

  let current = graph;
  let order = planGraph(current, deps.nodes);
  let keys = computeKeys(order, current);
  // Biên kịch trong phạm vi đã có kết quả (cache) khác bộ cảnh nhóm đang giữ, nhóm chưa sửa tay: lần chạy sẽ tạo lại nhóm
  // trước khi chạy cảnh (regroup() trong executor), nên ước tính theo bộ cảnh mới. Nhóm đã sửa tay thì lần chạy dừng hỏi.
  const before = scopeNodes(order, scope);
  let next = current;
  for (const p of order) {
    if (!before.has(p.node.id)) continue;
    const groups = writerGroups(next, p.node.id);
    if (groups.length === 0) continue;
    const key = keys.get(p.node.id)!;
    const shots = cachedOutputs(key)?.shots;
    if (shots?.kind !== "shotlist") continue;
    for (const g of groups) {
      if (g.source?.resultKey === key || groupEdited(next, g.id)) continue;
      next = rebuildWriterGroup(next, { writerId: p.node.id, groupId: g.id, shots: shots.shots, resultKey: key }).graph;
    }
  }
  if (next !== current) {
    current = next;
    order = planGraph(current, deps.nodes);
    keys = computeKeys(order, current);
  }
  const inScope = scopeNodes(order, scope);

  const outputs = new Map<string, NodeOutputs>();
  const firstOfKey = new Map<string, string>();
  const status = new Map<string, EstimateNode["status"]>();
  // Node viết chữ sẽ chạy: chưa biết nó viết gì, nên chưa biết các node phụ thuộc nó tốn bao nhiêu (fromWriter).
  const writing = new Set<string>();
  const fromWriter = new Set<string>();
  const media = (mediaId: string) => deps.storage.getMedia(mediaId);
  const nodes: EstimateNode[] = [];
  for (const p of order) {
    const id = p.node.id;
    if (!inScope.has(id)) continue;
    const def = p.impl.definition;
    const key = keys.get(id)!;
    const twin = firstOfKey.get(key);
    let state: EstimateNode["status"] = "cached";
    let calls = ZERO;
    const hit = twin === undefined ? cachedOutputs(key) : undefined;
    if (twin !== undefined) {
      const shared = outputs.get(twin);
      if (shared) outputs.set(id, shared);
    } else if (hit) {
      outputs.set(id, hit);
    } else {
      const connected = new Set(p.inputs.keys());
      const afterWriter = sourcesOf(p).some((s) => writing.has(s) || fromWriter.has(s));
      let estimated: Calls | undefined;
      if (!afterWriter && !sourcesOf(p).some((s) => status.get(s) === "unknown")) {
        // Còn cổng đã nối mà chưa biết giá trị (node nguồn sẽ chạy, không dự đoán được): không tra cache bước con, không dự đoán —
        // khoá bước con tính trên đầu vào thiếu khác khoá lúc chạy thật, trúng cache cũ là ước thiếu. Node ước theo tham số
        // (và các cổng đã biết, ví dụ danh sách cảnh của Dựng phim), mọi bước coi như phải tạo.
        const gathered = gatherInputs(p, current, (nodeId) => outputs.get(nodeId));
        const complete = gathered.missing.length === 0;
        const known: EstimateKnown = { inputs: gathered.inputs, step: complete ? stepOf(p) : () => undefined, media };
        estimated = def.estimate ? def.estimate(p.params, connected, known) : providerOf(p.params) === null ? ZERO : undefined;
        const predicted = complete && estimated && isZero(estimated) ? def.predict?.(p.params, connected, known) : undefined;
        if (predicted) outputs.set(id, predicted);
      }
      if (estimated) {
        state = "run";
        calls = estimated;
      } else {
        state = "unknown";
        calls = def.estimate?.(p.params, connected) ?? ZERO;
        if (afterWriter) fromWriter.add(id);
      }
      if (calls.text > 0) writing.add(id);
    }
    if (twin === undefined) firstOfKey.set(key, id);
    status.set(id, state);
    nodes.push({ id, label: labelOf(p, current), provider: providerOf(p.params), status: state, calls });
  }

  const total = nodes.reduce((sum, n) => add(sum, n.calls), ZERO);
  const museTotal = nodes.filter((n) => n.provider === "muse").reduce((sum, n) => add(sum, n.calls), ZERO);
  const waitsOnWriter = [...writing].some((id) => writerGroups(current, id).length > 0) || fromWriter.size > 0;
  return { nodes, total, museTotal, waitsOnWriter };
}
