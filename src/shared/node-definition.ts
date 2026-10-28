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
  // Node tạo ảnh mẫu: chạy xong thì kết quả vào kho tài sản dùng chung (chọn lại ở workflow khác không tốn lượt).
  library?: AssetKind;
  // Phiên bản phần code quyết định kết quả (prompt): đưa vào khoá cache node (codeVersion() ở src/shared/prompts.ts).
  cacheVersion?: string;
};

export const ASSET_KINDS = ["character", "location", "props"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type AnyNodeDefinition = NodeDefinition<unknown>;

export function defineNode<P>(definition: NodeDefinition<P>): NodeDefinition<P> {
  return definition;
}
