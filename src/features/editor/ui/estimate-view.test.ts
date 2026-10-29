import { describe, expect, it } from "vitest";
import type { EstimateNode, EstimateResponse } from "../../../shared/api";
import { callsText, estimateText, needsConfirm, rowText } from "./estimate-view";

const none = { image: 0, video: 0, text: 0 };
const est = (over: Partial<EstimateResponse> = {}): EstimateResponse => ({ nodes: [], total: none, museTotal: none, waitsOnWriter: false, warnings: [], ...over });
const node = (over: Partial<EstimateNode> = {}): EstimateNode => ({ id: "n", label: "Cảnh 1", provider: "muse", status: "run", calls: none, ...over });

describe("estimateText", () => {
  it("0 → '0 lượt Muse (dùng lại hết)'", () => {
    expect(estimateText(est())).toBe("0 lượt Muse (dùng lại hết)");
  });

  it("{image:1, video:2} + 1 unknown → '1 ảnh + 2 video Muse + chưa biết (1 node)'", () => {
    const e = est({ museTotal: { image: 1, video: 2, text: 0 }, nodes: [node({ status: "unknown", id: "w" })] });
    expect(estimateText(e)).toBe("1 ảnh + 2 video Muse + chưa biết (1 node)");
  });

  it("bỏ phần bằng 0, chữ đứng cuối", () => {
    expect(estimateText(est({ museTotal: { image: 0, video: 3, text: 0 } }))).toBe("3 video Muse");
    expect(estimateText(est({ museTotal: { image: 4, video: 1, text: 1 } }))).toBe("4 ảnh + 1 video + 1 chữ Muse");
  });

  it("chỉ có node chưa biết thì không ghi 'dùng lại hết' (chưa chắc là 0)", () => {
    expect(estimateText(est({ nodes: [node({ status: "unknown" }), node({ id: "m", status: "unknown" })] }))).toBe("0 lượt Muse + chưa biết (2 node)");
  });

  it("waitsOnWriter", () => {
    expect(estimateText(est({ museTotal: { image: 0, video: 1, text: 0 }, waitsOnWriter: true }))).toBe("1 video Muse — số cảnh chưa biết đến khi Biên kịch viết xong");
    expect(estimateText(est({ waitsOnWriter: true, nodes: [node({ status: "unknown" })] }))).toBe(
      "0 lượt Muse + chưa biết (1 node) — số cảnh chưa biết đến khi Biên kịch viết xong",
    );
  });
});

describe("needsConfirm", () => {
  const all = { mode: "all" } as const;
  const one = { mode: "node", nodeId: "n" } as const;

  it("Chạy cả workflow luôn hỏi, kể cả khi 0 lượt", () => {
    expect(needsConfirm(all, est())).toBe(true);
  });

  it("chạy một node hoặc từ đây trở đi: 0 lượt Muse và không có node chưa biết thì không hỏi", () => {
    expect(needsConfirm(one, est({ nodes: [node({ provider: null, status: "run" })] }))).toBe(false);
    expect(needsConfirm({ mode: "downstream", nodeId: "n" }, est())).toBe(false);
  });

  it("chạy một node: có lượt Muse hoặc node chưa biết thì hỏi", () => {
    expect(needsConfirm(one, est({ museTotal: { image: 0, video: 1, text: 0 } }))).toBe(true);
    expect(needsConfirm(one, est({ nodes: [node({ status: "unknown" })] }))).toBe(true);
  });

  it("dịch vụ giả tốn lượt giả nhưng không phải lượt Muse: chạy một node không hỏi", () => {
    expect(needsConfirm(one, est({ total: { image: 0, video: 1, text: 0 }, nodes: [node({ provider: "fake", calls: { image: 0, video: 1, text: 0 } })] }))).toBe(false);
  });
});

describe("rowText", () => {
  it("dùng lại / sẽ gọi Muse / chưa biết", () => {
    expect(rowText(node({ status: "cached" }))).toBe("dùng lại");
    expect(rowText(node({ calls: { image: 1, video: 1, text: 0 } }))).toBe("sẽ gọi Muse: 1 ảnh + 1 video");
    expect(rowText(node({ status: "unknown" }))).toBe("chưa biết");
    expect(rowText(node({ status: "unknown", calls: { image: 0, video: 1, text: 0 } }))).toBe("chưa biết (ước theo tham số: 1 video)");
  });

  it("dịch vụ giả và node không gọi dịch vụ nào", () => {
    expect(rowText(node({ provider: "fake", calls: { image: 0, video: 1, text: 0 } }))).toBe("chạy bằng dịch vụ giả: 1 video (không tốn lượt Muse)");
    expect(rowText(node({ provider: null }))).toBe("chạy, không gọi dịch vụ");
    expect(rowText(node({ provider: "muse" }))).toBe("chạy, không tốn lượt");
  });
});

describe("callsText", () => {
  it("liệt kê ảnh, video, chữ; bằng 0 hết thì '0 lượt'", () => {
    expect(callsText({ image: 2, video: 0, text: 1 })).toBe("2 ảnh + 1 chữ");
    expect(callsText(none)).toBe("0 lượt");
  });
});
