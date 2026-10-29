import type { FlowNode } from "./GraphNode";
import { isFrame } from "./groups";

// Phần nhân bản dời so với node gốc (đơn vị canvas).
export const DUPLICATE_OFFSET = 40;

// Nhân bản node `id`: node mới mã `newId`, lệch DUPLICATE_OFFSET, tham số chép sâu, KHÔNG kèm dây và KHÔNG vào nhóm nào; là node
// duy nhất được chọn. Trả null khi không có node đó hoặc đó là khung nhóm (khung chỉ để vẽ).
export function duplicateNode(nodes: readonly FlowNode[], id: string, newId: string): FlowNode[] | null {
  const source = nodes.find((n) => n.id === id);
  if (!source || isFrame(source)) return null;
  const copy: FlowNode = {
    id: newId,
    type: source.type,
    position: { x: source.position.x + DUPLICATE_OFFSET, y: source.position.y + DUPLICATE_OFFSET },
    selected: true,
    data: { params: structuredClone(source.data.params) },
  };
  return [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), copy];
}

// Mã cho node mới của loại `type`, chưa trùng node nào đang có.
export function freshNodeId(type: string, nodes: readonly { id: string }[]): string {
  const base = `${type}-${Date.now().toString(36)}`;
  const taken = new Set(nodes.map((n) => n.id));
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
  return id;
}

// Node có "lần tạo" (take) không? Đọc từ schema tham số của node (z.object có khoá `take`), không liệt kê loại node cứng.
// Schema bọc kiểu pipe/transform không có `.shape` nên bị coi là không có take; node-ops.test.ts bắt buộc mọi schema tham số là z.object trơn
// để một lần bọc như vậy làm test hỏng, không lặng lẽ ẩn mục ↻.
export function paramsHaveTake(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null || !("shape" in schema)) return false;
  const shape = schema.shape;
  return typeof shape === "object" && shape !== null && "take" in shape;
}

// Lần tạo kế tiếp của node: take hiện có + 1; chưa có hoặc hỏng thì coi như đang ở lần 1.
export function nextTake(params: Record<string, unknown>): number {
  const take = params.take;
  return (typeof take === "number" && Number.isInteger(take) && take >= 1 ? take : 1) + 1;
}

// Tham số take trước khi "Chạy lại (bản mới)" tăng nó: có khoá take hay không, và giá trị.
export type TakeBefore = { had: boolean; value: unknown };

export const takeBefore = (params: Record<string, unknown>): TakeBefore => ({ had: "take" in params, value: params.take });

// Trả take về như cũ (huỷ ở hộp xác nhận): chưa có khoá thì bỏ hẳn khoá, để bản lưu giống hệt trước khi bấm.
export function restoreTake(params: Record<string, unknown>, before: TakeBefore): Record<string, unknown> {
  const { take: _bumped, ...rest } = params;
  return before.had ? { ...rest, take: before.value } : rest;
}
