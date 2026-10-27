import type { ProviderRegistry } from "../providers/types";
import type { AnyNodeDefinition, NodeDefinition } from "../shared/node-definition";
import type { NodeOutputs, PortValue } from "../shared/ports";
import type { Ffmpeg } from "./ffmpeg";
import type { Storage } from "./storage";

export type StepValue = { [k: string]: string | number | boolean | null | StepValue | StepValue[] };

export type NodeRunContext = {
  signal: AbortSignal;
  report(message: string): void;
  partial(outputs: NodeOutputs): void;
  step<T extends StepValue>(keyParts: unknown, fn: () => Promise<T>): Promise<T>;
  providers: ProviderRegistry;
  storage: Storage;
  ffmpeg: Ffmpeg;
};

export type NodeInputs = Record<string, PortValue>;

export type NodeRun<P> = (ctx: NodeRunContext, inputs: NodeInputs, params: P) => Promise<NodeOutputs>;

export type ServerNode = {
  definition: AnyNodeDefinition;
  parseParams(raw: unknown): unknown;
  run(ctx: NodeRunContext, inputs: NodeInputs, parsedParams: unknown): Promise<NodeOutputs>;
};

export function serverNode<P>(definition: NodeDefinition<P>, run: NodeRun<P>): ServerNode {
  return {
    definition,
    parseParams: (raw) => definition.params.parse(raw),
    run: (ctx, inputs, parsed) => run(ctx, inputs, parsed as P),
  };
}

export function requireInput<K extends PortValue["kind"]>(
  inputs: NodeInputs,
  name: string,
  kind: K,
): Extract<PortValue, { kind: K }> {
  const v = inputs[name];
  if (!v || v.kind !== kind) throw new Error(`Thiếu đầu vào "${name}" kiểu ${kind}`);
  return v as Extract<PortValue, { kind: K }>;
}
