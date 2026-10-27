import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { media } from "./db/schema";

export type MediaRecord = typeof media.$inferSelect;
export type MediaKind = MediaRecord["kind"];

export type Storage = {
  tmpPath(ext: string): Promise<string>;
  writeTemp(bytes: Uint8Array, ext: string): Promise<string>;
  removeTemp(filePath: string): Promise<void>;
  sha256File(filePath: string): Promise<string>;
  hasSha256(sha: string): boolean;
  importFile(
    tmpFile: string,
    meta: { kind: MediaKind; source: string; width?: number; height?: number; durationSec?: number },
  ): Promise<MediaRecord>;
  getMedia(id: string): MediaRecord | undefined;
  absPath(rec: MediaRecord): string;
};

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function safeExt(ext: string): string {
  const clean = ext.replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]{2,5}$/.test(clean)) throw new Error(`Phần mở rộng file không hợp lệ: ${ext}`);
  return clean;
}

export function createStorage(dirs: { mediaDir: string; tmpDir: string }, db: Db): Storage {
  const removeTemp = async (filePath: string) => {
    if (!isInside(filePath, dirs.tmpDir)) throw new Error(`Chỉ được xoá file tạm trong ${dirs.tmpDir}: ${filePath}`);
    await rm(filePath, { force: true });
  };

  const sha256File = (filePath: string) =>
    new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      createReadStream(filePath)
        .on("data", (chunk) => hash.update(chunk))
        .on("error", reject)
        .on("end", () => resolve(hash.digest("hex")));
    });

  const getBySha = (sha: string) => db.select().from(media).where(eq(media.sha256, sha)).get();

  return {
    async tmpPath(ext) {
      await mkdir(dirs.tmpDir, { recursive: true });
      return path.join(dirs.tmpDir, `${randomUUID()}.${safeExt(ext)}`);
    },

    async writeTemp(bytes, ext) {
      await mkdir(dirs.tmpDir, { recursive: true });
      const p = path.join(dirs.tmpDir, `${randomUUID()}.${safeExt(ext)}`);
      await writeFile(p, bytes);
      return p;
    },

    removeTemp,
    sha256File,
    hasSha256: (sha) => getBySha(sha) !== undefined,

    async importFile(tmpFile, meta) {
      const sha = await sha256File(tmpFile);
      const existing = getBySha(sha);
      if (existing) {
        if (isInside(tmpFile, dirs.tmpDir)) await removeTemp(tmpFile);
        return existing;
      }
      const id = randomUUID();
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const ext = safeExt(path.extname(tmpFile) || (meta.kind === "video" ? "mp4" : "jpg"));
      const relPath = path.posix.join(month, `${id}.${ext}`);
      const dest = path.join(dirs.mediaDir, month, `${id}.${ext}`);
      await mkdir(path.dirname(dest), { recursive: true });
      if (isInside(tmpFile, dirs.tmpDir)) await rename(tmpFile, dest);
      else await copyFile(tmpFile, dest);
      const rec: MediaRecord = {
        id,
        sha256: sha,
        kind: meta.kind,
        relPath,
        width: meta.width ?? null,
        height: meta.height ?? null,
        durationSec: meta.durationSec ?? null,
        source: meta.source,
        createdAt: now.getTime(),
      };
      db.insert(media).values(rec).run();
      return rec;
    },

    getMedia: (id) => db.select().from(media).where(eq(media.id, id)).get(),
    absPath: (rec) => path.join(dirs.mediaDir, ...rec.relPath.split("/")),
  };
}
