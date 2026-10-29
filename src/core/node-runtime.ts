import type { ProviderRegistry } from "../providers/types";
import type { AnyNodeDefinition, NodeDefinition } from "../shared/node-definition";
import { pickInput, type NodeInputs, type NodeOutputs, type PortValue } from "../shared/ports";
import type { Ffmpeg } from "./ffmpeg";
import type { RunShared } from "./run-shared";
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
  // Chung cho mọi node của lần chạy: chỗ chạy theo dịch vụ, khoá chat, chat mới nhất của nhân vật, cầu dao.
  shared: RunShared;
};

export type { NodeInputs };

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
  if (Array.isArray(v)) throw new Error(`Cổng "${name}" nhận nhiều dây, phải đọc bằng requireInputs`);
  if (!v || v.kind !== kind) throw new Error(`Thiếu đầu vào "${name}" kiểu ${kind}`);
  return v as Extract<PortValue, { kind: K }>;
}

// Cổng không bắt buộc: chưa nối (hoặc nối giá trị khác kiểu) thì trả undefined.
export const optionalInput = pickInput;

// Cổng `multiple`: trả mọi giá trị theo thứ tự; chưa nối thì mảng rỗng; có giá trị sai kiểu thì báo lỗi.
export function requireInputs<K extends PortValue["kind"]>(
  inputs: NodeInputs,
  name: string,
  kind: K,
): Extract<PortValue, { kind: K }>[] {
  const v = inputs[name];
  const list = v === undefined ? [] : Array.isArray(v) ? v : [v];
  for (const item of list) if (item.kind !== kind) throw new Error(`Đầu vào "${name}" có giá trị không phải kiểu ${kind}`);
  return list as Extract<PortValue, { kind: K }>[];
}
