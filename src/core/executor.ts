import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import type { ProviderRegistry } from "../providers/types";
import { NodeOutputsSchema, type NodeOutputs, type PortValue } from "../shared/ports";
import type { WorkflowGraph, WorkflowNode } from "../shared/workflow";
import type { Db } from "./db/client";
import { nodeCache, runNodes } from "./db/schema";
import type { Ffmpeg } from "./ffmpeg";
import type { NodeInputs, ServerNode, StepValue } from "./node-runtime";
import { recordAsset } from "../features/assets/store";
import { collectMediaIds } from "./media-ids";
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
};

export type SourceRef = { source: string; sourceHandle: string };

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
    planned.set(n.id, { node: n, impl, params, inputs: new Map() });
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
    for (const wires of p.inputs.values()) for (const src of wires) visit(src.source);
    state.set(id, "done");
    order.push(p);
  };
  for (const n of graph.nodes) visit(n.id);
  return order;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
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

function mediaStillValid(value: unknown, storage: Storage): boolean {
  return collectMediaIds(value).every((id) => {
    const rec = storage.getMedia(id);
    return rec !== undefined && existsSync(storage.absPath(rec));
  });
}

function outputsStillValid(outputs: NodeOutputs, storage: Storage): boolean {
  return Object.values(outputs).every((v: PortValue) => mediaStillValid(v, storage));
}

export async function executeRun(deps: ExecuteDeps, runId: string, graph: WorkflowGraph, signal: AbortSignal): Promise<void> {
  const { db } = deps;
  const now = () => Date.now();
  const setNode = (nodeId: string, patch: Partial<typeof runNodes.$inferInsert>) =>
    db.update(runNodes).set({ ...patch, updatedAt: now() }).where(and(eq(runNodes.runId, runId), eq(runNodes.nodeId, nodeId))).run();

  for (const n of graph.nodes) {
    db.insert(runNodes)
      .values({ runId, nodeId: n.id, status: "pending", updatedAt: now() })
      .onConflictDoNothing()
      .run();
  }

  let order: PlannedNode[];
  try {
    order = planGraph(graph, deps.nodes);
  } catch (err) {
    for (const n of graph.nodes) setNode(n.id, { status: "skipped" });
    throw err;
  }

  const outputs = new Map<string, NodeOutputs>();
  const keys = new Map<string, string>();
  const remember = (p: PlannedNode, key: string, out: NodeOutputs) => {
    const kind = p.impl.definition.library;
    if (kind) recordAsset(db, { cacheKey: key, kind, params: p.params, outputs: out });
  };

  for (let i = 0; i < order.length; i++) {
    const p = order[i]!;
    const id = p.node.id;
    if (signal.aborted) throw new Error("Run đã bị dừng");

    const inputs: NodeInputs = {};
    const upstream: Record<string, string> = {};
    for (const port of p.impl.definition.inputs) {
      if (!p.inputs.has(port.name)) continue;
      const wires = port.multiple ? orderSources(p, port.name, graph) : p.inputs.get(port.name)!;
      const values = wires.map((src) => {
        const value = outputs.get(src.source)?.[src.sourceHandle];
        if (!value) throw new Error(`Node nguồn "${src.source}" không trả cổng "${src.sourceHandle}"`);
        return value;
      });
      inputs[port.name] = port.multiple ? values : values[0]!;
      upstream[port.name] = wires.map((src) => `${keys.get(src.source)}:${src.sourceHandle}`).join(",");
    }
    const take = takeOf(p.params);
    const stepScope = p.impl.definition.stepScope ?? p.node.type;
    const key = cacheKeyOf(p.node.type, p.params, upstream, p.impl.definition.cacheVersion);
    keys.set(id, key);

    const cached = db.select().from(nodeCache).where(eq(nodeCache.cacheKey, key)).get();
    if (cached) {
      const parsed = NodeOutputsSchema.parse(JSON.parse(cached.outputJson));
      if (outputsStillValid(parsed, deps.storage)) {
        outputs.set(id, parsed);
        remember(p, key, parsed);
        setNode(id, { status: "cached", cacheKey: key, outputJson: cached.outputJson, message: "Dùng lại kết quả trước", error: null });
        continue;
      }
      db.delete(nodeCache).where(eq(nodeCache.cacheKey, key)).run();
    }

    setNode(id, { status: "running", cacheKey: key, message: "Đang chạy…", error: null });
    try {
      const result = await p.impl.run(
        {
          signal,
          report: (message) => setNode(id, { message }),
          partial: (partialOutputs) => setNode(id, { outputJson: JSON.stringify(NodeOutputsSchema.parse(partialOutputs)) }),
          step: async <T extends StepValue>(keyParts: unknown, fn: () => Promise<T>): Promise<T> => {
            const takePart = take > 1 ? `take${take}:` : "";
            const stepKey = createHash("sha256").update(`step:${stepScope}:${takePart}${stableStringify(keyParts)}`).digest("hex");
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
        },
        inputs,
        p.params,
      );
      const json = JSON.stringify(NodeOutputsSchema.parse(result));
      db.insert(nodeCache).values({ cacheKey: key, outputJson: json, createdAt: now() }).onConflictDoNothing().run();
      outputs.set(id, result);
      remember(p, key, result);
      setNode(id, { status: "succeeded", outputJson: json, message: "Xong" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNode(id, { status: "failed", error: message, message: null });
      for (const rest of order.slice(i + 1)) setNode(rest.node.id, { status: "skipped" });
      throw new Error(`Node "${p.impl.definition.label}" lỗi: ${message}`, { cause: err });
    }
  }
}
