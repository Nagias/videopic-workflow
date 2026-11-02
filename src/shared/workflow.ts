import { z } from "zod";

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  params: z.record(z.string(), z.unknown()),
});

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().min(1),
  target: z.string().min(1),
  targetHandle: z.string().min(1),
});

// Nhóm node trên canvas (nhóm "Phân cảnh": các node Cảnh theo thứ tự). Nhóm sinh từ Biên kịch có `source`:
// Biên kịch nào, từ kết quả nào (khoá cache), và ảnh chụp nhóm lúc tạo để biết đã bị sửa tay chưa (src/shared/scenes.ts).
// Nhóm người dùng tự gom bằng Ctrl+G có `manual: true` (và không có `source`): chỉ là khung nhìn trên canvas, không đổi tên
// thành viên, không ảnh hưởng ước tính hay thứ tự clip. Nhóm cũ không có trường này đều là nhóm Phân cảnh (isSceneGroup()).
export const GroupSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  nodeIds: z.array(z.string()),
  source: z.object({ writerId: z.string().min(1), resultKey: z.string(), snapshot: z.string() }).optional(),
  manual: z.boolean().optional(),
});

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  groups: z.array(GroupSchema).default([]),
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowGroup = z.infer<typeof GroupSchema>;
// Kiểu đầu vào: đồ thị viết tay (mẫu, test, giao diện) được bỏ `groups`; đọc qua schema thì luôn có mảng.
export type WorkflowGraph = z.input<typeof WorkflowGraphSchema>;

// Nhóm Phân cảnh (sinh từ Biên kịch, mẫu, workflow cũ chuyển sang) khác nhóm tay: chỉ nhóm Phân cảnh được đánh số "Cảnh n" cho thành viên.
export const isSceneGroup = (group: Pick<WorkflowGroup, "manual">): boolean => group.manual !== true;
