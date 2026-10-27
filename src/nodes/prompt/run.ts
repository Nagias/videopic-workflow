import type { NodeRun } from "../../core/node-runtime";
import type { PromptParams } from "./definition";

export const run: NodeRun<PromptParams> = (_ctx, _inputs, params) => Promise.resolve({ text: { kind: "text", text: params.text } });
