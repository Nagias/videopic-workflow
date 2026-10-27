import { serverNode, type ServerNode } from "../../src/core/node-runtime";
import { definition as genDef } from "../../src/nodes/generate-video/definition";
import { run as genRun } from "../../src/nodes/generate-video/run";
import { definition as promptDef } from "../../src/nodes/prompt/definition";
import { run as promptRun } from "../../src/nodes/prompt/run";
import { createFakeProvider } from "../../src/providers/fake";
import type { ProviderRegistry, VideoProvider } from "../../src/providers/types";
import type { WorkflowGraph } from "../../src/shared/workflow";

export const testNodes: Record<string, ServerNode> = {
  prompt: serverNode(promptDef, promptRun),
  "generate-video": serverNode(genDef, genRun),
};

export function countingFakeProviders(): { providers: ProviderRegistry; calls: () => number } {
  const fake = createFakeProvider();
  let n = 0;
  const counted: VideoProvider = {
    id: "fake",
    generateVideo: (req, ctx) => {
      n++;
      return fake.generateVideo(req, ctx);
    },
  };
  return {
    providers: {
      get: (id) => {
        if (id !== "fake") throw new Error(`Test chỉ dùng dịch vụ fake, không dùng ${id}`);
        return counted;
      },
    },
    calls: () => n,
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
