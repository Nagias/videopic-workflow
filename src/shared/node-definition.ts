import type { z } from "zod";
import type { NodeInputs, NodeOutputs, PortDef } from "./ports";
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
  // Ước tính số lần gọi dịch vụ ngoài; connected = tên các cổng vào đã nối. Có `known` thì đếm đúng các bước con còn thiếu
  // cache với đầu vào đã biết; cổng chưa biết thì ước theo tham số (thà dư còn hơn thiếu). undefined: không ước được (đầu vào
  // quyết định số lượt chưa có) → "unknown". Node có tham số provider bắt buộc khai báo (tests/architecture.test.ts).
  // src/core/estimate.ts gọi. (Khai báo kiểu phương thức để NodeDefinition<P> gán được cho AnyNodeDefinition.)
  estimate?(params: P, connected: ReadonlySet<string>, known?: EstimateKnown): Calls | undefined;
  // Kết quả node sẽ ra khi mọi bước con đã có (0 lượt), để ước tính node phía sau theo đúng đầu vào; undefined khi còn thiếu
  // bước con. Chỉ đúng các trường node phía sau dùng để ước tính (mã media, kích thước); không lưu, không hiện.
  predict?(params: P, connected: ReadonlySet<string>, known: EstimateKnown): NodeOutputs | undefined;
  // Kiểm luật trên cả đồ thị trước khi lần chạy khởi chạy node đầu tiên (chưa tốn lượt nào); trả danh sách lỗi.
  // Có lỗi thì cả lần chạy dừng (src/core/preflight.ts).
  preflight?(ctx: PreflightCtx): string[];
};

// Điều đã biết trước khi chạy một node: giá trị đầu vào, cache bước con, thông tin file media đã lưu.
export type EstimateKnown = {
  // Chỉ các cổng mà mọi node nguồn đã có kết quả (cache, hoặc predict()); cổng vắng là chưa biết.
  // Còn cổng đã nối mà chưa biết thì step() luôn trả undefined và không gọi predict() (src/core/estimate.ts).
  inputs: Readonly<NodeInputs>;
  // Giá trị đã lưu của bước con ctx.step(keyParts) của chính node này (đúng vùng stepScope và lần tạo take); chưa có thì undefined.
  step(keyParts: unknown): unknown;
  // Kích thước/thời lượng thật của file (bảng media); không có file thì undefined.
  media(mediaId: string): { width: number | null; height: number | null; durationSec: number | null } | undefined;
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
