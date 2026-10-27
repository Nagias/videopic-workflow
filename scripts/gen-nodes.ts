import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NODES_DIR = fileURLToPath(new URL("../src/nodes", import.meta.url));
export const REQUIRED_FILES = ["definition.ts", "run.ts", "view.tsx", "node.test.ts"] as const;
const HEADER = "// Sinh tự động bởi `npm run gen:nodes` từ các thư mục src/nodes/<loại>/ — không sửa tay.\n";

export function listNodeDirs(nodesDir = NODES_DIR): string[] {
  return readdirSync(nodesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

const ident = (dir: string) => dir.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function viewExportName(dir: string): string {
  const src = readFileSync(path.join(NODES_DIR, dir, "view.tsx"), "utf8");
  const m = /export function (\w+View)\b/.exec(src);
  if (!m?.[1]) throw new Error(`src/nodes/${dir}/view.tsx phải export function <Tên>View`);
  return m[1];
}

export function render(dirs: string[]): { server: string; web: string } {
  for (const dir of dirs) {
    if (!/^[a-z][a-z0-9-]*$/.test(dir)) throw new Error(`Tên thư mục node phải là chữ thường-gạch-ngang: ${dir}`);
    for (const f of REQUIRED_FILES) {
      if (!existsSync(path.join(NODES_DIR, dir, f))) throw new Error(`Node "${dir}" thiếu file ${f} (dùng npm run new:node để tạo đủ khuôn)`);
    }
  }
  const server = [
    HEADER,
    `import { serverNode, type ServerNode } from "../core/node-runtime";`,
    ...dirs.flatMap((d) => [
      `import { definition as ${ident(d)}Definition } from "./${d}/definition";`,
      `import { run as ${ident(d)}Run } from "./${d}/run";`,
    ]),
    "",
    "export const serverNodes: Record<string, ServerNode> = {",
    ...dirs.map((d) => `  [${ident(d)}Definition.type]: serverNode(${ident(d)}Definition, ${ident(d)}Run),`),
    "};",
    "",
  ].join("\n");
  const web = [
    HEADER,
    `import { webNode, type WebNode } from "../features/editor/ui/node-kit";`,
    ...dirs.flatMap((d) => [
      `import { definition as ${ident(d)}Definition } from "./${d}/definition";`,
      `import { ${viewExportName(d)} } from "./${d}/view";`,
    ]),
    "",
    "export const webNodes: Record<string, WebNode> = {",
    ...dirs.map((d) => `  [${ident(d)}Definition.type]: webNode(${ident(d)}Definition, ${viewExportName(d)}),`),
    "};",
    "",
  ].join("\n");
  return { server, web };
}

function main() {
  const check = process.argv.includes("--check");
  const { server, web } = render(listNodeDirs());
  const targets: [string, string][] = [
    [path.join(NODES_DIR, "registry.server.ts"), server],
    [path.join(NODES_DIR, "registry.web.ts"), web],
  ];
  let stale = false;
  for (const [file, content] of targets) {
    const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
    if (current === content) continue;
    if (check) {
      console.error(`${path.relative(process.cwd(), file)} lệch với thư mục src/nodes — chạy "npm run gen:nodes".`);
      stale = true;
    } else {
      writeFileSync(file, content);
      console.log(`Đã sinh ${path.relative(process.cwd(), file)}`);
    }
  }
  if (stale) process.exit(1);
  if (!check) console.log(`Registry: ${listNodeDirs().join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
