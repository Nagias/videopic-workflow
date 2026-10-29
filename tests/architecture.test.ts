import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listNodeDirs, REQUIRED_FILES } from "../scripts/gen-nodes";
import { serverNodes } from "../src/nodes/registry.server";
import { PROVIDER_IDS } from "../src/shared/providers";

const ROOT = path.join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("khoá cứng kiến trúc", () => {
  it("mỗi thư mục node có đủ definition/run/view/test và type trùng tên thư mục", () => {
    for (const dir of listNodeDirs()) {
      for (const f of REQUIRED_FILES) expect(statSync(path.join(ROOT, "src/nodes", dir, f)).isFile(), `${dir}/${f}`).toBe(true);
      expect(serverNodes[dir]?.definition.type, `node ${dir}`).toBe(dir);
    }
    expect(Object.keys(serverNodes).sort()).toEqual(listNodeDirs());
  });

  it("node có tham số provider (gọi dịch vụ) phải khai báo estimate, để ước tính lượt không coi nó là miễn phí", () => {
    const missing = Object.values(serverNodes)
      .filter((n) => {
        const shape = (n.definition.params as { shape?: Record<string, unknown> }).shape;
        return shape !== undefined && "provider" in shape && !n.definition.estimate;
      })
      .map((n) => n.definition.type);
    expect(missing, "thêm estimate() vào definition.ts của các node này").toEqual([]);
    expect(Object.values(serverNodes).filter((n) => (n.definition.params as { shape?: Record<string, unknown> }).shape === undefined).map((n) => n.definition.type)).toEqual([]);
  });

  it("mọi dịch vụ khai báo trong src/shared/providers.ts đều có thư mục cài đặt trong src/providers/", () => {
    for (const id of PROVIDER_IDS) expect(statSync(path.join(ROOT, "src/providers", id, "index.ts")).isFile(), id).toBe(true);
  });

  it("mọi endpoint trong src/features/*/routes.ts đều có mặt trong FEATURE_MAP.md", () => {
    const map = read("FEATURE_MAP.md");
    const routes = walk(path.join(ROOT, "src/features"))
      .filter((f) => f.endsWith("routes.ts"))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/app\.(get|put|post|delete|patch)(?:<[^>]*>)?\(\s*"([^"]+)"/g)])
      .map((m) => `${m[1]!.toUpperCase()} ${m[2]}`);
    expect(routes.length).toBeGreaterThan(0);
    const missing = routes.filter((r) => !map.includes(`\`${r}\``));
    expect(missing, "Thêm các endpoint này vào FEATURE_MAP.md").toEqual([]);
  });

  it("mọi data-testid trong FEATURE_MAP.md đều có thật trong code giao diện", () => {
    const map = read("FEATURE_MAP.md");
    const ui = walk(path.join(ROOT, "src")).filter((f) => f.endsWith(".tsx")).map((f) => readFileSync(f, "utf8")).join("\n");
    const ids = [...map.matchAll(/data-testid=([a-z0-9-]+?)((?:-<[^>]+>)*)\]/g)].map((m) => ({ id: m[1]!, dynamic: m[2] !== "" }));
    expect(ids.length).toBeGreaterThan(15);
    const missing = ids.filter(({ id, dynamic }) => (dynamic ? !ui.includes(`\`${id}-`) : !ui.includes(`"${id}"`))).map((x) => x.id);
    expect(missing).toEqual([]);
  });

  it("DEBT.md: bảng 'Đang nợ' đủ 6 cột, mã N-xxx không trùng, cột 'Trả khi' không trống", () => {
    const debt = read("DEBT.md");
    const section = debt.split("## Đang nợ")[1]?.split("## Đã trả")[0] ?? "";
    const rows = section.split("\n").filter((l) => /^\|\s*N-\d{3}\s*\|/.test(l));
    expect(rows.length).toBeGreaterThan(0);
    const codes = new Set<string>();
    for (const row of rows) {
      const cells = row.split("|").slice(1, -1).map((c) => c.trim());
      expect(cells.length, row).toBe(6);
      expect(codes.has(cells[0]!), `trùng mã ${cells[0]}`).toBe(false);
      codes.add(cells[0]!);
      expect(cells[4]!.length, `${cells[0]} thiếu "Trả khi"`).toBeGreaterThan(0);
    }
  });

  it(".gitignore chặn .data/ (hồ sơ Chrome đăng nhập Muse, db, media) và .env", () => {
    const gi = read(".gitignore");
    expect(gi).toMatch(/^\.data\/$/m);
    expect(gi).toMatch(/^\.env$/m);
  });

  it("bảng workflows chỉ được ghi ở src/features/workflows/store.ts", () => {
    const store = path.join(ROOT, "src/features/workflows/store.ts");
    const offenders = walk(path.join(ROOT, "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && f !== store)
      .filter((f) => /\.(insert|update|delete)\(\s*workflows\s*\)/.test(readFileSync(f, "utf8")));
    expect(offenders, "ghi workflow qua saveWorkflowGraph()").toEqual([]);
    expect(readFileSync(store, "utf8")).toMatch(/\.insert\(workflows\)/);
  });

  it("không file nào trong src/ trỏ sang dự án khác hay ổ C", () => {
    const offenders = walk(path.join(ROOT, "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /[A-Z]:\\\\|D:\/(?!29)|C:\//.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
