import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../core/db/client";
import { media, runNodes, runs } from "../../core/db/schema";
import { RunScopeSchema } from "../../core/executor";
import type { WorkflowResponse } from "../../shared/api";
import { normalizeShots, type Shot } from "../../shared/director";
import { stableStringify } from "../../shared/hash";
import { NodeOutputsSchema, type NodeOutputs } from "../../shared/ports";
import { PROVIDER_IDS } from "../../shared/providers";
import { expandScenes, snapshotGroup, type ExpandScenesArgs } from "../../shared/scenes";
import { WorkflowGraphSchema, type WorkflowEdge, type WorkflowGraph } from "../../shared/workflow";
import { getWorkflowRow, saveWorkflowGraph, toWorkflowResponse, type WorkflowRow } from "./store";

// Chuyển workflow cũ (Danh sách cảnh / Biên kịch → Dựng phim) sang nhóm node Cảnh + Ghép phim khi mở, một lần,
// không gọi dịch vụ nào (spec 2026-10-28-canvas-the-anh mục 7). Cảnh mới có cùng chữ nên cùng khoá bước con với
// Dựng phim: bấm Chạy thì cảnh đã có clip dùng lại bước con, ra đúng phim cũ. Cache node không bị ghi ở đây.

export const BACKUP_SUFFIX = "-ban-cu";
export const OLD_RESULT_MESSAGE = "Kết quả cũ từ Dựng phim — bấm Chạy để kiểm lại (0 lượt)";

const REF_PORTS = ["character", "location", "props"] as const;
const DONE = ["succeeded", "cached"] as const;

// Kết quả Biên kịch (khoá cache + danh sách cảnh) trong lần chạy đã ra phim.
export type WriterResult = { key: string; shots: Shot[] };

export type ConvertedFilm = {
  filmId: string;
  combineId: string;
  groupId: string;
  sceneIds: string[];
  shots: Shot[];
  // Node đã đưa danh sách cảnh vào Dựng phim.
  shotsFrom?: { id: string; type: "shotlist" | "writer" };
};

export function upgradeLegacyGraph(
  input: WorkflowGraph,
  writers: ReadonlyMap<string, WriterResult> = new Map(),
): { graph: WorkflowGraph; changed: boolean; films: ConvertedFilm[] } {
  const filmNodes = input.nodes.filter((n) => n.type === "film");
  if (filmNodes.length === 0) return { graph: input, changed: false, films: [] };

  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  let graph: WorkflowGraph = input;
  const films: ConvertedFilm[] = [];
  const removed = new Set<string>();
  const rewired: WorkflowEdge[] = [];

  for (const film of filmNodes) {
    const into = (port: string) => input.edges.find((e) => e.target === film.id && e.targetHandle === port);
    const shotsEdge = into("shots");
    const from = shotsEdge ? byId.get(shotsEdge.source) : undefined;
    let shots: Shot[] = [];
    let shotsFrom: ConvertedFilm["shotsFrom"];
    let writer: { writerId: string; resultKey: string } | undefined;
    if (from?.type === "shotlist") {
      // Đọc như giao diện đọc (kể cả cảnh dạng cũ chỉ có `action`): giữ toàn bộ chữ từng cảnh.
      shots = normalizeShots(from.params.shots);
      shotsFrom = { id: from.id, type: "shotlist" };
      removed.add(from.id);
    } else if (from?.type === "writer") {
      const result = writers.get(from.id);
      shots = result?.shots ?? [];
      shotsFrom = { id: from.id, type: "writer" };
      writer = { writerId: from.id, resultKey: result?.key ?? "" };
    }

    const refs: ExpandScenesArgs["refs"] = {};
    const handles = new Map<string, string>();
    for (const port of REF_PORTS) {
      const e = into(port);
      if (!e) continue;
      refs[port] = e.source;
      handles.set(port, e.sourceHandle);
    }
    const provider = PROVIDER_IDS.find((p) => p === film.params.provider);
    if (!provider) throw new Error(`Dựng phim "${film.id}" chưa chọn dịch vụ hợp lệ — không chuyển được sang node Cảnh`);

    const expanded = expandScenes(graph, { ...writer, shots, refs, provider, origin: film.position });
    const group = expanded.graph.groups?.find((g) => g.id === expanded.groupId);
    const sceneIds = group?.nodeIds ?? [];
    const members = new Set(sceneIds);
    const fixBrightness = typeof film.params.fixBrightness === "boolean" ? film.params.fixBrightness : true;
    graph = {
      ...expanded.graph,
      nodes: expanded.graph.nodes.map((n) => (n.id === expanded.combineId ? { ...n, params: { ...n.params, fixBrightness } } : n)),
      // Dây tham chiếu đi từ đúng cổng ra mà Dựng phim đã dùng.
      edges: expanded.graph.edges.map((e) => {
        const handle = members.has(e.target) ? handles.get(e.targetHandle) : undefined;
        return handle !== undefined && e.source === refs[e.targetHandle as (typeof REF_PORTS)[number]] ? { ...e, sourceHandle: handle } : e;
      }),
    };
    // Phim của Dựng phim đang nối đi đâu thì Ghép phim nối tới đó; dây storyboard bỏ.
    for (const e of input.edges) if (e.source === film.id && e.sourceHandle === "video") rewired.push({ ...e, source: expanded.combineId });
    removed.add(film.id);
    films.push({ filmId: film.id, combineId: expanded.combineId, groupId: expanded.groupId, sceneIds, shots, ...(shotsFrom ? { shotsFrom } : {}) });
  }

  graph = {
    ...graph,
    nodes: graph.nodes.filter((n) => !removed.has(n.id)),
    edges: [...graph.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)), ...rewired],
  };
  // Ảnh chụp nhóm sinh từ Biên kịch tính trên đồ thị cuối cùng: thẻ vừa chuyển chưa bị sửa tay.
  const fromWriter = new Set(films.filter((f) => f.shotsFrom?.type === "writer").map((f) => f.groupId));
  const done = graph;
  graph = {
    ...done,
    groups: (done.groups ?? []).map((g) => (g.source && fromWriter.has(g.id) ? { ...g, source: { ...g.source, snapshot: snapshotGroup(done, g.id) } } : g)),
  };
  return { graph, changed: true, films };
}

type FilmRun = { runId: string; createdAt: number; graph: WorkflowGraph; output: NodeOutputs };

// Lần chạy mới nhất của workflow mà Dựng phim này ra phim (chạy hoặc dùng lại).
function lastFilmRun(db: Db, workflowId: string, filmId: string): FilmRun | undefined {
  const row = db
    .select({ runId: runs.id, createdAt: runs.createdAt, graphJson: runs.graphJson, outputJson: runNodes.outputJson })
    .from(runNodes)
    .innerJoin(runs, eq(runs.id, runNodes.runId))
    .where(and(eq(runs.workflowId, workflowId), eq(runNodes.nodeId, filmId), inArray(runNodes.status, [...DONE])))
    .orderBy(desc(runs.createdAt))
    .limit(1)
    .get();
  if (!row?.outputJson) return undefined;
  const output = NodeOutputsSchema.parse(JSON.parse(row.outputJson));
  if (output.video?.kind !== "video") return undefined;
  return { runId: row.runId, createdAt: row.createdAt, graph: WorkflowGraphSchema.parse(JSON.parse(row.graphJson)), output };
}

const doneRow = (db: Db, runId: string, nodeId: string) =>
  db
    .select()
    .from(runNodes)
    .where(and(eq(runNodes.runId, runId), eq(runNodes.nodeId, nodeId), inArray(runNodes.status, [...DONE])))
    .get();

function writerResult(db: Db, runId: string, writerId: string): WriterResult | undefined {
  const row = doneRow(db, runId, writerId);
  if (!row?.cacheKey || !row.outputJson) return undefined;
  const shots = NodeOutputsSchema.parse(JSON.parse(row.outputJson)).shots;
  return shots?.kind === "shotlist" ? { key: row.cacheKey, shots: shots.shots } : undefined;
}

// Đầu ra hiển thị của một cảnh: ảnh khung và clip cũ, kích thước/thời lượng lấy từ bảng media. Thiếu media thì bỏ cổng đó.
function sceneOutput(db: Db, keyframeId: string | undefined, clipId: string | undefined): NodeOutputs {
  const rec = (id: string | undefined) => (id ? db.select().from(media).where(eq(media.id, id)).get() : undefined);
  const out: NodeOutputs = {};
  const frame = rec(keyframeId);
  if (frame && frame.width !== null && frame.height !== null) out.frame = { kind: "image", mediaId: frame.id, width: frame.width, height: frame.height };
  const clip = rec(clipId);
  if (clip && clip.width !== null && clip.height !== null && clip.durationSec !== null) {
    out.clip = { kind: "video", mediaId: clip.id, durationSec: clip.durationSec, width: clip.width, height: clip.height };
  }
  return out;
}

// Một lần chạy chỉ để hiển thị (trạng thái succeeded nên hàng chờ không bao giờ lấy): cảnh mới hiện ảnh khung và clip cũ,
// Ghép phim hiện phim cũ, node giữ mã (Nhân vật/Không gian/Đồ vật/Biên kịch…) hiện kết quả của lần chạy cũ.
// Chỉ hiện kết quả cũ cho cảnh có chữ đúng như lúc chạy cũ; phim cũ chỉ hiện khi mọi cảnh đều đúng.
function writeDisplayRun(db: Db, workflowId: string, graph: WorkflowGraph, films: { film: ConvertedFilm; run: FilmRun }[]): void {
  if (films.length === 0) return;
  const now = Date.now();
  const runId = randomUUID();
  const rows = new Map<string, typeof runNodes.$inferInsert>();
  const put = (nodeId: string, output: NodeOutputs, extra: Partial<typeof runNodes.$inferInsert> = {}) =>
    rows.set(nodeId, { runId, nodeId, status: "cached", outputJson: JSON.stringify(output), message: OLD_RESULT_MESSAGE, error: null, updatedAt: now, ...extra });

  const newest = films.reduce((a, b) => (b.run.createdAt > a.run.createdAt ? b : a)).run;
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const r of db.select().from(runNodes).where(and(eq(runNodes.runId, newest.runId), inArray(runNodes.status, [...DONE]))).all()) {
    if (!ids.has(r.nodeId) || !r.outputJson) continue;
    put(r.nodeId, NodeOutputsSchema.parse(JSON.parse(r.outputJson)), { status: r.status, cacheKey: r.cacheKey, message: r.message });
  }

  for (const { film, run } of films) {
    const board = run.output.storyboard?.kind === "storyboard" ? run.output.storyboard.shots : [];
    const ranShots =
      film.shotsFrom?.type === "shotlist"
        ? normalizeShots(run.graph.nodes.find((n) => n.id === film.shotsFrom!.id && n.type === "shotlist")?.params.shots)
        : film.shots;
    let all = film.shots.length > 0 && ranShots.length === film.shots.length;
    film.sceneIds.forEach((sceneId, i) => {
      const b = board[i];
      const same = ranShots[i] !== undefined && stableStringify(ranShots[i]) === stableStringify(film.shots[i]);
      const output = same && b?.status === "done" ? sceneOutput(db, b.keyframeId, b.clipId) : {};
      if (Object.keys(output).length > 0) put(sceneId, output);
      if (!output.clip) all = false;
    });
    if (all && run.output.video) put(film.combineId, { video: run.output.video });
  }
  if (rows.size === 0) return;

  db.insert(runs)
    .values({
      id: runId,
      workflowId,
      graphJson: JSON.stringify(WorkflowGraphSchema.parse(graph)),
      scopeJson: JSON.stringify(RunScopeSchema.parse({ mode: "all" })),
      status: "succeeded",
      createdAt: now,
      startedAt: now,
      finishedAt: now,
    })
    .run();
  for (const row of rows.values()) db.insert(runNodes).values(row).run();
}

// Mở workflow: workflow cũ thì chuyển (một giao dịch: bản sao lưu "<id>-ban-cu" nếu chưa có, đồ thị mới, lần chạy hiển thị).
// Không chuyển: bản sao lưu (giữ nguyên để quay lại được), workflow không có Dựng phim, và workflow đang có lần chạy
// xếp hàng/đang chạy (lần đó chạy đồ thị cũ; mở lại sau khi xong thì chuyển). Không chuyển thì không ghi gì.
export function upgradeWorkflowOnOpen(db: Db, row: WorkflowRow): WorkflowResponse {
  const graph = WorkflowGraphSchema.parse(JSON.parse(row.graphJson));
  if (row.id.endsWith(BACKUP_SUFFIX) || !graph.nodes.some((n) => n.type === "film")) return toWorkflowResponse(row);
  const pending = db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.workflowId, row.id), inArray(runs.status, ["queued", "running"])))
    .limit(1)
    .get();
  if (pending) return toWorkflowResponse(row);

  return db.transaction(() => {
    const filmRuns = new Map<string, FilmRun>();
    const writers = new Map<string, WriterResult>();
    for (const film of graph.nodes.filter((n) => n.type === "film")) {
      const run = lastFilmRun(db, row.id, film.id);
      if (!run) continue;
      filmRuns.set(film.id, run);
      const src = graph.edges.find((e) => e.target === film.id && e.targetHandle === "shots")?.source;
      const writerId = src !== undefined && graph.nodes.find((n) => n.id === src)?.type === "writer" ? src : undefined;
      const result = writerId === undefined ? undefined : writerResult(db, run.runId, writerId);
      if (writerId !== undefined && result) writers.set(writerId, result);
    }

    const upgraded = upgradeLegacyGraph(graph, writers);
    const backupId = `${row.id}${BACKUP_SUFFIX}`;
    if (!getWorkflowRow(db, backupId)) saveWorkflowGraph(db, backupId, graph, `${row.name} (bản cũ)`);
    const saved = saveWorkflowGraph(db, row.id, upgraded.graph);
    const shown = upgraded.films.flatMap((film) => {
      const run = filmRuns.get(film.filmId);
      return run ? [{ film, run }] : [];
    });
    writeDisplayRun(db, row.id, upgraded.graph, shown);
    return toWorkflowResponse(saved);
  });
}
