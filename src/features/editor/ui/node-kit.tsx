import { createContext, useContext, type ComponentType } from "react";
import type { RunNodeState } from "../../../shared/api";
import type { AnyNodeDefinition, NodeDefinition } from "../../../shared/node-definition";

// Một dây đang cắm vào node: node nguồn (mã, tên người đọc, toạ độ trên canvas) và cổng của node này mà dây cắm vào.
// View cần biết nguồn của mình (dải thứ tự clip của Ghép phim) thì đọc ở `incoming`; kết quả của nguồn lấy qua useEditor().stateOf().
export type IncomingWire = { source: string; port: string; label: string; position: { x: number; y: number } };

export type NodeViewProps<P> = {
  id: string;
  params: P;
  incoming: readonly IncomingWire[];
  setParams: (patch: Partial<P>) => void;
  // Thay toàn bộ tham số (chọn từ kho): giữ đúng tham số cũ để máy chủ trúng lại kết quả đã có.
  replaceParams: (params: Record<string, unknown>) => void;
  state: RunNodeState | undefined;
};

export type WebNode = {
  definition: AnyNodeDefinition;
  View: ComponentType<NodeViewProps<Record<string, unknown>>>;
};

export function webNode<P>(definition: NodeDefinition<P>, View: ComponentType<NodeViewProps<P>>): WebNode {
  return { definition, View: View as unknown as WebNode["View"] };
}

export type EditorApi = {
  setParams(nodeId: string, patch: Record<string, unknown>): void;
  replaceParams(nodeId: string, params: Record<string, unknown>): void;
  stateOf(nodeId: string): RunNodeState | undefined;
  // Đổi khi chuyển workflow hoặc có lượt chạy mới: ô dữ liệu lấy từ máy chủ (kho tài sản) tải lại theo khoá này.
  refreshKey: string;
  // Đang chạy, đang xin chạy hoặc đang tải lại đồ thị sau lần chạy: nút đổi đồ thị phía máy chủ (Tạo thẻ cảnh) phải chờ.
  busy: boolean;
  // Tạo (thay) nhóm thẻ cảnh từ kết quả Biên kịch mới nhất: lưu sửa đổi đang chờ, gọi máy chủ, rồi hiện đồ thị mới.
  // Lỗi (ví dụ Biên kịch chưa có kết quả) hiện ở thanh báo lỗi.
  expandScenes(writerId: string): void;
  // Tên node cho người đọc ("Cảnh 3" trong nhóm Phân cảnh, "Hồ sơ nhân vật: Mai"): cùng cách đặt tên với thông báo của lần chạy.
  titleOf(nodeId: string, baseLabel: string, params: unknown): string;
  // Chạy riêng một node từ nút ▶ trên thẻ. Chưa có lệnh này thì thẻ không hiện nút (không để lệnh chết).
  runNode?(nodeId: string): void;
};

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor phải nằm trong EditorContext");
  return ctx;
}

export const STATUS_LABEL: Record<RunNodeState["status"], string> = {
  pending: "Chờ",
  running: "Đang chạy",
  succeeded: "Xong",
  cached: "Dùng lại kết quả",
  failed: "Lỗi",
  skipped: "Bỏ qua",
};
