import type { z } from "zod";
import type { PortDef } from "./ports";

export type NodeDefinition<P> = {
  type: string;
  label: string;
  description: string;
  inputs: PortDef[];
  outputs: PortDef[];
  params: z.ZodType<P>;
  defaults: P;
};

export type AnyNodeDefinition = NodeDefinition<unknown>;

export function defineNode<P>(definition: NodeDefinition<P>): NodeDefinition<P> {
  return definition;
}
