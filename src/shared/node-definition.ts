import type { z } from "zod";
import type { PortDef } from "./ports";
import type { WorkflowGraph, WorkflowNode } from "./workflow";

// Số lần gọi dịch vụ ngoài mà một lần chạy node dự kiến tốn (để hiện ước tính trước khi chạy).
export type Calls = { image: number; video: number; text: number };

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
  // Ẩn khỏi menu thêm node (node dùng nội bộ hoặc gộp vào node khác).
  hidden?: boolean;
  // Tên vùng khoá cache bước con (ctx.step); mặc định là type. Node cùng vùng dùng chung kết quả bước con.
  stepScope?: string;
  // Ước tính số lần gọi dịch vụ ngoài; connected = tên các cổng vào đã nối.
  // (Khai báo kiểu phương thức để NodeDefinition<P> gán được cho AnyNodeDefinition.)
  estimate?(params: P, connected: ReadonlySet<string>): Calls;
  // Kiểm luật trên cả đồ thị trước khi lần chạy khởi chạy node đầu tiên (chưa tốn lượt nào); trả danh sách lỗi.
  // Có lỗi thì cả lần chạy dừng (src/core/preflight.ts).
  preflight?(ctx: PreflightCtx): string[];
};

// Node đã lập kế hoạch nhìn từ file dùng chung: PlannedNode (src/core/executor.ts) khớp kiểu này.
export type PreflightNode = {
  node: WorkflowNode;
  // Tham số đã qua zod của node.
  params: unknown;
  inputs: ReadonlyMap<string, readonly SourceRef[]>;
};
export type SourceRef = { source: string; sourceHandle: string };

export type PreflightCtx = {
  node: PreflightNode;
  graph: WorkflowGraph;
  planned: ReadonlyMap<string, PreflightNode>;
  // Dây vào một cổng của node, cổng `multiple` đúng thứ tự node sẽ nhận khi chạy (orderSources()).
  sources(nodeId: string, port: string): SourceRef[];
};

export const ASSET_KINDS = ["character", "location", "props"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type AnyNodeDefinition = NodeDefinition<unknown>;

export function defineNode<P>(definition: NodeDefinition<P>): NodeDefinition<P> {
  return definition;
}
