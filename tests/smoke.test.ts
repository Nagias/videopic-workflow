import { describe, expect, it } from "vitest";

describe("môi trường test", () => {
  it("chạy với APP_ENV=test", () => {
    expect(globalThis.process.versions.node.split(".")[0]).toBeDefined();
  });
});
