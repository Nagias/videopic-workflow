import { describe, expect, it } from "vitest";
import type { RunResponse } from "../../../shared/api";
import { runView } from "./run-view";

const decision = { kind: "scenes-edited", writerId: "w1", groupId: "g1" } as const;
const mk = (over: Partial<RunResponse>): RunResponse => ({ id: "r1", status: "succeeded", error: null, decision: null, nodes: {}, ...over });

const HISTORY_DECISION_TEXT = "Lần chạy trước dừng vì Biên kịch ra bộ cảnh mới mà thẻ cảnh đã được sửa tay. Bấm ▶ Chạy để chọn Thay hoặc Giữ.";

describe("runView — hộp hỏi Thay/Giữ", () => {
  it("lần chạy còn đang chạy mà đã có decision: KHÔNG hiện hộp (máy chủ chưa xong việc)", () => {
    for (const status of ["queued", "running"] as const) {
      for (const fromHistory of [false, true]) {
        const v = runView(mk({ status, decision }), fromHistory);
        expect(v.active).toBe(true);
        expect(v.pendingDecision).toBeNull();
      }
    }
  });

  it("lần chạy xem trực tiếp đã dừng (lỗi) và có decision: hiện hộp", () => {
    const v = runView(mk({ status: "failed", error: "Biên kịch ra bộ cảnh mới", decision }), false);
    expect(v.pendingDecision).toEqual(decision);
    expect(v.fromHistory).toBe(false);
  });

  it("lần chạy cũ tải lại và có decision: không hiện hộp, chỉ dặn bấm Chạy", () => {
    const v = runView(mk({ status: "failed", error: "Biên kịch ra bộ cảnh mới", decision }), true);
    expect(v.pendingDecision).toBeNull();
    expect(v.fromHistory).toBe(true);
    expect(v.runError).toBe(HISTORY_DECISION_TEXT);
  });

  it("không có decision hoặc không có lần chạy: không hộp", () => {
    expect(runView(mk({ status: "failed", error: "x" }), false).pendingDecision).toBeNull();
    expect(runView(null, false).pendingDecision).toBeNull();
  });
});

describe("runView — nhãn và lỗi (giữ như Editor.tsx trước khi tách)", () => {
  it("chưa có lần chạy: nhãn rỗng, không lỗi", () => {
    const v = runView(null, false);
    expect(v).toMatchObject({ active: false, fromHistory: false, runLabel: "", runError: null });
  });

  it("lần chạy xem trực tiếp: nhãn trạng thái, lỗi nguyên văn", () => {
    expect(runView(mk({ status: "queued" }), false).runLabel).toBe("Đang xếp hàng…");
    expect(runView(mk({ status: "running" }), false).runLabel).toBe("Đang chạy…");
    expect(runView(mk({ status: "succeeded" }), false).runLabel).toBe("Chạy xong");
    const failed = runView(mk({ status: "failed", error: "hỏng" }), false);
    expect(failed.runLabel).toBe("Lỗi");
    expect(failed.runError).toBe("hỏng");
  });

  it("lần chạy cũ đã dừng: nhãn có 'Lần trước:', lỗi có tiền tố", () => {
    expect(runView(mk({ status: "succeeded" }), true).runLabel).toBe("Lần trước: Chạy xong");
    const failed = runView(mk({ status: "failed", error: "hỏng" }), true);
    expect(failed.runLabel).toBe("Lần trước: Lỗi");
    expect(failed.runError).toBe("Lần chạy trước lỗi: hỏng");
  });

  it("cờ lịch sử còn bật nhưng lần chạy đang chạy: coi như xem trực tiếp (không 'Lần trước')", () => {
    const v = runView(mk({ status: "running", error: "e" }), true);
    expect(v.fromHistory).toBe(false);
    expect(v.runLabel).toBe("Đang chạy…");
    expect(v.runError).toBe("e");
  });
});
