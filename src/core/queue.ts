import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { WorkflowGraphSchema, type WorkflowGraph } from "../shared/workflow";
import { runs } from "./db/schema";
import { RunScopeSchema, type RunScope } from "../shared/api";
import { executeRun, type ExecuteDeps } from "./executor";

export type CancelResult = "cancelled" | "not_found" | "finished";

export type Queue = {
  enqueue(workflowId: string, graph: WorkflowGraph, scope?: RunScope): string;
  cancel(runId: string): CancelResult;
  processNext(): Promise<boolean>;
  start(): void;
  stop(): Promise<void>;
};

const CANCELLED = "Đã huỷ";

export function createQueue(deps: ExecuteDeps, opts: { pollMs?: number; log?: (msg: string) => void } = {}): Queue {
  const { db } = deps;
  const pollMs = opts.pollMs ?? 500;
  const log = opts.log ?? (() => undefined);
  // Tín hiệu dừng chung (tắt máy chủ); mỗi run có thêm AbortController riêng để huỷ đúng run đó.
  const abort = new AbortController();
  const active = new Map<string, AbortController>();
  const cancelled = new Set<string>();
  let loop: Promise<void> | null = null;

  const claim = () =>
    db.transaction((tx) => {
      const next = tx.select().from(runs).where(eq(runs.status, "queued")).orderBy(asc(runs.createdAt)).limit(1).get();
      if (!next) return undefined;
      tx.update(runs).set({ status: "running", startedAt: Date.now(), error: null }).where(eq(runs.id, next.id)).run();
      return next;
    });

  const finish = (id: string, patch: { status: "succeeded" | "failed"; error?: string }) =>
    db.update(runs).set({ ...patch, finishedAt: Date.now() }).where(eq(runs.id, id)).run();

  const processNext = async (): Promise<boolean> => {
    const run = claim();
    if (!run) return false;
    const own = new AbortController();
    active.set(run.id, own);
    log(`Chạy run ${run.id}`);
    try {
      const graph = WorkflowGraphSchema.parse(JSON.parse(run.graphJson));
      const scope = run.scopeJson ? RunScopeSchema.parse(JSON.parse(run.scopeJson)) : { mode: "all" as const };
      await executeRun(deps, run.id, run.workflowId, graph, AbortSignal.any([abort.signal, own.signal]), scope);
      if (cancelled.has(run.id)) {
        finish(run.id, { status: "failed", error: CANCELLED });
        log(`Run ${run.id} đã huỷ`);
      } else {
        finish(run.id, { status: "succeeded" });
        log(`Run ${run.id} xong`);
      }
    } catch (err) {
      const message = cancelled.has(run.id) ? CANCELLED : err instanceof Error ? err.message : String(err);
      finish(run.id, { status: "failed", error: message });
      log(`Run ${run.id} lỗi: ${message}`);
    } finally {
      active.delete(run.id);
      cancelled.delete(run.id);
    }
    return true;
  };

  return {
    enqueue(workflowId, graph, scope = { mode: "all" }) {
      const id = randomUUID();
      db.insert(runs)
        .values({ id, workflowId, graphJson: JSON.stringify(graph), scopeJson: JSON.stringify(RunScopeSchema.parse(scope)), status: "queued", createdAt: Date.now() })
        .run();
      return id;
    },
    cancel(runId) {
      const own = active.get(runId);
      if (own) {
        cancelled.add(runId);
        own.abort();
        return "cancelled";
      }
      const row = db.select().from(runs).where(eq(runs.id, runId)).get();
      if (!row) return "not_found";
      if (row.status === "succeeded" || row.status === "failed") return "finished";
      // Đang xếp hàng, hoặc kẹt "running" từ lần tắt máy trước mà chưa ai chạy lại: huỷ thẳng trong db.
      const done = db
        .update(runs)
        .set({ status: "failed", error: CANCELLED, finishedAt: Date.now() })
        .where(and(eq(runs.id, runId), eq(runs.status, row.status)))
        .run();
      return done.changes > 0 ? "cancelled" : "finished";
    },
    processNext,
    start() {
      if (loop) return;
      const resumed = db.update(runs).set({ status: "queued" }).where(eq(runs.status, "running")).run();
      if (resumed.changes > 0) log(`Chạy tiếp ${resumed.changes} run bị dừng giữa chừng lần trước`);
      loop = (async () => {
        while (!abort.signal.aborted) {
          const worked = await processNext();
          if (!worked) await new Promise((r) => setTimeout(r, pollMs));
        }
      })();
    },
    async stop() {
      abort.abort();
      await loop;
      loop = null;
    },
  };
}
