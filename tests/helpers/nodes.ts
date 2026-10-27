import type { ServerNode } from "../../src/core/node-runtime";
import { serverNodes } from "../../src/nodes/registry.server";
import { createFakeProvider } from "../../src/providers/fake";
import type { MediaProvider, ProviderRegistry } from "../../src/providers/types";
import type { WorkflowGraph } from "../../src/shared/workflow";

export const testNodes: Record<string, ServerNode> = serverNodes;

export type CallLog = { video: number; image: number; videoPrompts: string[]; firstFrames: (string | undefined)[] };

export function countingFakeProviders(opts: { failVideoWhen?: (prompt: string) => boolean } = {}): {
  providers: ProviderRegistry;
  calls: () => number;
  log: CallLog;
} {
  const fake = createFakeProvider();
  const log: CallLog = { video: 0, image: 0, videoPrompts: [], firstFrames: [] };
  const counted: MediaProvider = {
    id: "fake",
    maxParallel: () => 2,
    generateVideo: (req, ctx) => {
      log.video++;
      log.videoPrompts.push(req.prompt);
      log.firstFrames.push(req.firstFrameMediaId);
      if (opts.failVideoWhen?.(req.prompt)) return Promise.reject(new Error("Lỗi giả lập của dịch vụ"));
      return fake.generateVideo(req, ctx);
    },
    generateImage: (req, ctx) => {
      log.image++;
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
