import { describe, expect, it } from "vitest";
import { definition } from "./definition";
import { run } from "./run";

describe("node prompt", () => {
  it("cắt khoảng trắng và trả cổng text", async () => {
    const params = definition.params.parse({ text: "  rừng mưa  " });
    const out = await run({} as never, {}, params);
    expect(out).toEqual({ text: { kind: "text", text: "rừng mưa" } });
  });

  it("từ chối prompt rỗng", () => {
    expect(definition.params.safeParse({ text: " " }).success).toBe(false);
  });
});
