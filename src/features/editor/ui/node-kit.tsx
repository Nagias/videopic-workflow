import { createContext, useContext, type ComponentType } from "react";
import type { RunNodeState } from "../../../shared/api";
import type { AnyNodeDefinition, NodeDefinition } from "../../../shared/node-definition";

export type NodeViewProps<P> = {
  id: string;
  params: P;
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
