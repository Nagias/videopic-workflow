import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

export default async function globalSetup(): Promise<void> {
  const root = path.join(import.meta.dirname, "..", ".data-test");
  const old = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith("e2e-"));
  const newest = old.map((d) => d.name).sort().at(-1);
  for (const d of old) {
    if (d.name === newest) continue;
    await rm(path.join(root, d.name), { recursive: true, force: true }).catch((err: unknown) => {
      console.warn(`Không dọn được ${d.name}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}
