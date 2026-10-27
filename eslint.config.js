import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const WEB_FILES = ["src/app/**", "src/features/*/ui/**", "src/nodes/*/view.tsx", "src/nodes/registry.web.ts"];
const SERVER_FILES = ["src/core/**", "src/providers/**", "src/features/*/*.ts", "src/nodes/*/run.ts", "src/nodes/registry.server.ts", "src/server.ts", "src/app-server.ts"];

const lockMsg = (why) => `Đường cấm (CLAUDE.md mục 5): ${why}`;

const serverOnlyImports = [
  { group: ["node:*", "fs", "path", "child_process", "os", "crypto"], message: lockMsg("giao diện không được dùng module của Node.") },
  { group: ["fastify", "@fastify/*", "better-sqlite3", "drizzle-orm", "drizzle-orm/*", "playwright", "@playwright/*"], message: lockMsg("giao diện không được kéo thư viện máy chủ.") },
  { group: ["**/core/**", "**/providers/**", "**/run", "**/run.ts", "**/routes", "**/routes.ts", "**/service", "**/service.ts", "**/registry.server"], message: lockMsg("giao diện chỉ nói chuyện với máy chủ qua src/app/api-client.ts.") },
];

export default defineConfig(
  { ignores: ["node_modules/**", "dist/**", ".data/**", ".data-test/**", ".cache/**", "test-results/**", "playwright-report/**", "src/core/db/migrations/**"] },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["*.js"] }, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-warning-comments": ["error", { terms: ["todo", "fixme", "hack", "xxx", "tạm thời", "làm tạm"], location: "anywhere" }],
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: false }],
      eqeqeq: ["error", "always"],
      "no-restricted-properties": ["error", { object: "process", property: "env", message: lockMsg("chỉ src/core/config.ts được đọc process.env; truyền cấu hình qua loadConfig().") }],
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["better-sqlite3"], message: lockMsg("chỉ src/core/db/client.ts mở SQLite.") },
          { group: ["node:child_process", "child_process"], message: lockMsg("chỉ src/core/ffmpeg.ts chạy chương trình ngoài.") },
          { group: ["playwright", "playwright/*"], message: lockMsg("chỉ src/providers/muse/** và scripts Muse điều khiển trình duyệt.") },
          { group: ["@playwright/test"], message: lockMsg("@playwright/test chỉ dùng trong e2e/.") },
        ],
      }],
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["src/core/config.ts", "*.config.ts", "*.config.js", "e2e/**"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["scripts/muse-login.ts", "scripts/smoke-muse.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["better-sqlite3", "node:child_process"], message: lockMsg("Muse provider không mở db, không chạy chương trình ngoài.") }] }] },
  },
  {
    files: ["e2e/**", "playwright.config.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: WEB_FILES,
    rules: {
      "no-restricted-imports": ["error", { patterns: serverOnlyImports }],
      "no-restricted-globals": ["error", { name: "fetch", message: lockMsg("chỉ src/app/api-client.ts gọi fetch.") }],
    },
  },
  {
    files: ["src/app/api-client.ts"],
    rules: { "no-restricted-globals": "off" },
  },
  {
    files: ["src/shared/**", "src/nodes/*/definition.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          ...serverOnlyImports,
          { group: ["react", "react-dom", "@xyflow/*", "**/features/**", "**/app/**", "**/view"], message: lockMsg("file dùng chung (shared, definition) không import giao diện.") },
        ],
      }],
    },
  },
  {
    files: SERVER_FILES,
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-dom", "react-dom/*", "@xyflow/*"], message: lockMsg("máy chủ không import React.") },
          { group: ["**/view", "**/view.tsx", "**/ui/**", "**/app/**", "**/registry.web"], message: lockMsg("máy chủ không import code giao diện.") },
          { group: ["better-sqlite3"], message: lockMsg("chỉ src/core/db/client.ts mở SQLite.") },
          { group: ["node:child_process", "child_process"], message: lockMsg("chỉ src/core/ffmpeg.ts chạy chương trình ngoài.") },
          { group: ["playwright", "playwright/*"], message: lockMsg("chỉ src/providers/muse/** điều khiển trình duyệt.") },
        ],
      }],
    },
  },
  {
    files: ["src/core/db/client.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["react", "playwright", "node:child_process"], message: lockMsg("db chỉ mở SQLite.") }] }] },
  },
  {
    files: ["src/core/ffmpeg.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["react", "better-sqlite3", "playwright"], message: lockMsg("ffmpeg.ts chỉ chạy ffmpeg/ffprobe.") }] }] },
  },
  {
    files: ["src/providers/muse/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["react", "better-sqlite3", "node:child_process"], message: lockMsg("Muse provider không mở db, không chạy chương trình ngoài.") }] }] },
  },
);
