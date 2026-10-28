import { describe, expect, it } from "vitest";
import { checkShotList, parsePropLines, ShotSchema, type Shot } from "../../shared/director";
import { definition } from "./definition";
import { run } from "./run";

const s = (id: string, over: Partial<Shot> = {}): Shot => ({
  id,
  size: "MS",
  angle: "eye",
  move: "static",
  subject: "character",
  link: "cut",
  start: "cô gái đứng cạnh lều, nhìn sang trái",
  motion: "cô bước về phía suối",
  props: "",
  ...over,
});

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

  it("dữ liệu cũ dạng `action` vẫn đọc được: khung đầu = chuyển động = action, kèm cảnh báo", () => {
    const old = ShotSchema.parse({ id: "x", size: "MS", angle: "eye", move: "static", subject: "character", link: "cut", action: "cô bổ củi" });
    expect(old.start).toBe("cô bổ củi");
    expect(old.motion).toBe("cô bổ củi");
    expect(old.props).toBe("");
    expect(checkShotList([old]).warnings[0]).toMatch(/khung đầu và chuyển động giống hệt nhau/);
  });

  it("thiếu chuyển động → lỗi; cảnh cắt thiếu khung đầu → lỗi; cảnh nối không cần khung đầu", () => {
    expect(checkShotList([s("a", { motion: " " })]).errors[0]).toMatch(/Cảnh 1: chưa tả chuyển động/);
    expect(checkShotList([s("a", { start: "" })]).errors[0]).toMatch(/Cảnh 1: chưa tả khung đầu/);
    expect(checkShotList([s("a"), s("b", { link: "chain", start: "", size: "CU" })]).errors).toEqual([]);
  });

  it("đọc dòng đồ vật: `tên: a -> b`, `tên: a`, dòng trống bỏ qua, dòng sai báo số dòng", () => {
    expect(parsePropLines("khúc gỗ: nguyên khúc -> bổ đôi\n\nrìu: cầm tay")).toEqual({
      items: [
        { name: "khúc gỗ", from: "nguyên khúc", to: "bổ đôi" },
        { name: "rìu", from: "cầm tay" },
      ],
      errors: [],
    });
    expect(parsePropLines("rìu cầm tay").errors[0]).toMatch(/dòng 1/);
  });

  it("đồ vật xuất hiện lại phải đúng trạng thái cuối lần trước", () => {
    const shots = [
      s("a", { props: "khúc gỗ: nguyên khúc -> bổ đôi" }),
      s("b", { size: "WS", props: "khúc gỗ: nguyên khúc" }),
    ];
    expect(checkShotList(shots).errors[0]).toMatch(/Cảnh 2: "khúc gỗ" đang ở trạng thái "bổ đôi"/);
    expect(checkShotList([shots[0]!, s("b", { size: "WS", props: "khúc gỗ: bổ đôi" })]).errors).toEqual([]);
  });

  it("đồ vật đổi trạng thái mà không có người tác động → lỗi", () => {
    const err = checkShotList([s("a", { subject: "none", props: "khúc gỗ: nguyên khúc -> bổ đôi" })]).errors[0];
    expect(err).toMatch(/Cảnh 1: "khúc gỗ" đổi trạng thái nhưng không có người tác động/);
    expect(checkShotList([s("a", { subject: "hands", props: "khúc gỗ: nguyên khúc -> bổ đôi" })]).errors).toEqual([]);
  });

  it("cảnh ghi hơn 2 đồ vật → cảnh báo chỉ 2 món được gửi làm ảnh mẫu", () => {
    expect(checkShotList([s("a", { props: "rìu: cầm tay\nkhúc gỗ: nguyên khúc\nlều: dựng" })]).warnings[0]).toMatch(/Cảnh 1: có 3 đồ vật — chỉ 2 món/);
  });

  it("khi biết danh sách đồ vật: tên hoặc trạng thái lạ → lỗi", () => {
    const known = [{ name: "khúc gỗ", states: ["nguyên khúc", "bổ đôi"] }];
    expect(checkShotList([s("a", { props: "cái búa: cầm tay" })], known).errors[0]).toMatch(/Cảnh 1: chưa có đồ vật "cái búa"/);
    expect(checkShotList([s("a", { props: "khúc gỗ: cháy" })], known).errors[0]).toMatch(/Cảnh 1: "khúc gỗ" không có trạng thái "cháy"/);
    expect(checkShotList([s("a", { props: "Khúc Gỗ: nguyên khúc" })], known).errors).toEqual([]);
  });

  it("run trả danh sách và báo cảnh báo", async () => {
    const msgs: string[] = [];
    const out = await run({ report: (m: string) => msgs.push(m) } as never, {}, { shots: [s("a"), s("b")] });
    expect(out.shots).toEqual({ kind: "shotlist", shots: [s("a"), s("b")] });
    expect(msgs[0]).toMatch(/2 cảnh · lưu ý/);
  });
});
