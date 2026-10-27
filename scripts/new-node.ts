import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./gen-nodes";

const name = process.argv[2] ?? "";
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error("Cách dùng: npm run new:node -- <ten-node>   (chữ thường, gạch ngang, ví dụ extract-last-frame)");
  process.exit(1);
}
const dir = fileURLToPath(new URL(`../src/nodes/${name}`, import.meta.url));
if (existsSync(dir)) {
  console.error(`Đã có node ${name}`);
  process.exit(1);
}
const camel = name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const Pascal = camel[0]!.toUpperCase() + camel.slice(1);

const files: Record<string, string> = {
  "definition.ts": `import { z } from "zod";
import { defineNode } from "../../shared/node-definition";

export const params = z.object({
  text: z.string().trim().min(1, "Chưa nhập nội dung"),
});
export type ${Pascal}Params = z.infer<typeof params>;

export const definition = defineNode<${Pascal}Params>({
  type: "${name}",
  label: "${Pascal}",
  description: "Mô tả ngắn node này làm gì.",
  inputs: [],
  outputs: [{ name: "text", kind: "text", label: "Kết quả" }],
  params,
  defaults: { text: "" },
});
`,
  "run.ts": `import type { NodeRun } from "../../core/node-runtime";
import type { ${Pascal}Params } from "./definition";

export const run: NodeRun<${Pascal}Params> = (_ctx, _inputs, params) => Promise.resolve({ text: { kind: "text", text: params.text } });
`,
  "view.tsx": `import type { NodeViewProps } from "../../features/editor/ui/node-kit";
import type { ${Pascal}Params } from "./definition";

export function ${Pascal}View({ id, params, setParams }: NodeViewProps<${Pascal}Params>) {
  return (
    <label className="field">
      <span>Nội dung</span>
      <textarea className="nodrag nowheel" data-testid={\`${name}-text-\${id}\`} value={params.text ?? ""} onChange={(e) => setParams({ text: e.target.value })} />
    </label>
  );
}
`,
  "node.test.ts": `import { describe, expect, it } from "vitest";
import { definition } from "./definition";
import { run } from "./run";

describe("node ${name}", () => {
  it("trả cổng text", async () => {
    const out = await run({} as never, {}, definition.params.parse({ text: "a" }));
    expect(out).toEqual({ text: { kind: "text", text: "a" } });
  });
});
`,
};

mkdirSync(dir, { recursive: true });
for (const [f, content] of Object.entries(files)) writeFileSync(path.join(dir, f), content);
console.log(`Đã tạo src/nodes/${name}/ (definition.ts, run.ts, view.tsx, node.test.ts)`);
generate(false);
console.log("Tiếp theo: sửa definition/run/view theo việc của node, ghi vào FEATURE_MAP.md, chạy npm run verify.");
