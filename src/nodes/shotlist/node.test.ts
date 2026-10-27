import { describe, expect, it } from "vitest";
import { checkShotList, composeKeyframePrompt, composeMotionPrompt, type Shot } from "../../shared/director";
import { definition } from "./definition";
import { run } from "./run";

const s = (id: string, over: Partial<Shot> = {}): Shot => ({ id, size: "MS", angle: "eye", move: "static", subject: "character", link: "cut", action: "she walks", ...over });

describe("node shotlist + luật đạo diễn", () => {
  it("chặn: cảnh đầu nối, nối khác chủ thể, nối liền quá 2 cảnh, trùng mã", () => {
    expect(checkShotList([s("a", { link: "chain" })]).errors[0]).toMatch(/cảnh đầu tiên/);
    expect(checkShotList([s("a"), s("b", { link: "chain", subject: "none" })]).errors[0]).toMatch(/cùng chủ thể/);
    expect(checkShotList([s("a"), s("b", { link: "chain" }), s("c", { link: "chain" }), s("d", { link: "chain" })]).errors[0]).toMatch(/quá 2 cảnh/);
    expect(checkShotList([s("a"), s("a", { size: "WS" })]).errors[0]).toMatch(/trùng mã/);
    expect(definition.params.safeParse({ shots: [s("a", { link: "chain" })] }).success).toBe(false);
  });

  it("cảnh báo luật 30°: hai cảnh cắt liền cùng cỡ, cùng góc", () => {
    expect(checkShotList([s("a"), s("b")]).warnings[0]).toMatch(/luật 30°/);
    expect(checkShotList([s("a"), s("b", { size: "CU" })]).warnings).toEqual([]);
  });

  it("prompt ảnh khung và chuyển động lấy từ dữ liệu đạo diễn", () => {
    const k = composeKeyframePrompt(s("a", { size: "CU", angle: "low" }), "an adult woman", "a hillside");
    expect(k).toContain("close-up, low-angle camera");
    expect(k).toContain("Subject: an adult woman. she walks");
    expect(composeKeyframePrompt(s("b", { subject: "none" }), "x", "y")).toContain("No people in frame");
    expect(composeMotionPrompt(s("c", { move: "push_in" }))).toContain("slow dolly push-in");
  });

  it("run trả danh sách và báo cảnh báo", async () => {
    const msgs: string[] = [];
    const out = await run({ report: (m: string) => msgs.push(m) } as never, {}, { shots: [s("a"), s("b")] });
    expect(out.shots).toEqual({ kind: "shotlist", shots: [s("a"), s("b")] });
    expect(msgs[0]).toMatch(/2 cảnh · lưu ý/);
  });
});
