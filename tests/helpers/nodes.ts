import type { Ffmpeg } from "../../src/core/ffmpeg";
import type { NodeRunContext, ServerNode, StepValue } from "../../src/core/node-runtime";
import type { Storage } from "../../src/core/storage";
import type { NodeOutputs } from "../../src/shared/ports";
import { serverNodes } from "../../src/nodes/registry.server";
import { createFakeProvider } from "../../src/providers/fake";
import { ProviderError, type MediaProvider, type ProviderRegistry } from "../../src/providers/types";
import type { WorkflowGraph } from "../../src/shared/workflow";

export const testNodes: Record<string, ServerNode> = serverNodes;

export function testNodeCtx(
  env: { storage: Storage; ffmpeg: Ffmpeg },
  providers: ProviderRegistry,
  messages: string[] = [],
  partials: NodeOutputs[] = [],
): NodeRunContext {
  const steps = new Map<string, StepValue>();
  return {
    signal: new AbortController().signal,
    report: (m) => {
      messages.push(m);
    },
    partial: (o) => {
      partials.push(o);
    },
    step: async <T extends StepValue>(keyParts: unknown, fn: () => Promise<T>): Promise<T> => {
      const k = JSON.stringify(keyParts);
      const hit = steps.get(k);
      if (hit) return hit as T;
      const v = await fn();
      steps.set(k, v);
      return v;
    },
    providers,
    storage: env.storage,
    ffmpeg: env.ffmpeg,
  };
}

export type CallLog = { video: number; image: number; videoPrompts: string[]; firstFrames: (string | undefined)[]; imagePrompts: string[]; imageSessions: string[] };

export function countingFakeProviders(opts: { failVideoWhen?: (prompt: string) => boolean; failCode?: string } = {}): {
  providers: ProviderRegistry;
  calls: () => number;
  log: CallLog;
} {
  const fake = createFakeProvider();
  const log: CallLog = { video: 0, image: 0, videoPrompts: [], firstFrames: [], imagePrompts: [], imageSessions: [] };
  const counted: MediaProvider = {
    id: "fake",
    maxParallel: () => 2,
    generateVideo: (req, ctx) => {
      log.video++;
      log.videoPrompts.push(req.prompt);
      log.firstFrames.push(req.firstFrameMediaId);
      if (opts.failVideoWhen?.(req.prompt)) {
        return Promise.reject(opts.failCode ? new ProviderError(opts.failCode, "Lỗi máy chủ giả lập") : new Error("Lỗi giả lập của dịch vụ"));
      }
      return fake.generateVideo(req, ctx);
    },
    generateImage: (req, ctx) => {
      log.image++;
      log.imagePrompts.push(req.prompt);
      log.imageSessions.push(req.session === undefined ? "none" : req.session === "new" ? "new" : "continue");
      return fake.generateImage(req, ctx);
    },
  };
  return {
    providers: {
      get: (id) => {
        if (id !== "fake") throw new Error(`Test chỉ dùng dịch vụ fake, không dùng ${id}`);
        return counted;
      },
    },
    calls: () => log.video,
    log,
  };
}

export function promptToVideoGraph(text: string, provider: "fake" | "muse" = "fake"): WorkflowGraph {
  return {
    nodes: [
      { id: "p1", type: "prompt", position: { x: 0, y: 0 }, params: { text } },
      { id: "v1", type: "generate-video", position: { x: 300, y: 0 }, params: { provider, durationSec: 5 } },
    ],
    edges: [{ id: "e1", source: "p1", sourceHandle: "text", target: "v1", targetHandle: "prompt" }],
  };
}
