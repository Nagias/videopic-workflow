import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { WorkflowGraphSchema, type WorkflowGraph } from "../shared/workflow";
import { runs } from "./db/schema";
import { executeRun, type ExecuteDeps } from "./executor";

export type Queue = {
  enqueue(workflowId: string, graph: WorkflowGraph): string;
  processNext(): Promise<boolean>;
  start(): void;
  stop(): Promise<void>;
};

export function createQueue(deps: ExecuteDeps, opts: { pollMs?: number; log?: (msg: string) => void } = {}): Queue {
  const { db } = deps;
  const pollMs = opts.pollMs ?? 500;
  const log = opts.log ?? (() => undefined);
  const abort = new AbortController();
  let loop: Promise<void> | null = null;

  const claim = () =>
    db.transaction((tx) => {
      const next = tx.select().from(runs).where(eq(runs.status, "queued")).orderBy(asc(runs.createdAt)).limit(1).get();
      if (!next) return undefined;
      tx.update(runs).set({ status: "running", startedAt: Date.now(), error: null }).where(eq(runs.id, next.id)).run();
      return next;
    });

  const processNext = async (): Promise<boolean> => {
    const run = claim();
    if (!run) return false;
    log(`Chạy run ${run.id}`);
    try {
      const graph = WorkflowGraphSchema.parse(JSON.parse(run.graphJson));
      await executeRun(deps, run.id, graph, abort.signal);
      db.update(runs).set({ status: "succeeded", finishedAt: Date.now() }).where(eq(runs.id, run.id)).run();
      log(`Run ${run.id} xong`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.update(runs).set({ status: "failed", error: message, finishedAt: Date.now() }).where(eq(runs.id, run.id)).run();
      log(`Run ${run.id} lỗi: ${message}`);
    }
    return true;
  };

  return {
    enqueue(workflowId, graph) {
      const id = randomUUID();
      db.insert(runs)
        .values({ id, workflowId, graphJson: JSON.stringify(graph), status: "queued", createdAt: Date.now() })
        .run();
      return id;
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
