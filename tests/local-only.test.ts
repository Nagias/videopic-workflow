import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localRequestProblem } from "../src/app-server";
import { createTestServer, type TestServer } from "./helpers/server";

describe("chỉ nhận yêu cầu từ chính máy này (chống trang web lạ bấm Chạy hộ)", () => {
  it("localRequestProblem", () => {
    const json = { host: "localhost:8787", "content-type": "application/json" };
    expect(localRequestProblem("POST", json)).toBeNull();
    expect(localRequestProblem("POST", { ...json, origin: "http://localhost:5173" })).toBeNull();
    expect(localRequestProblem("POST", { ...json, origin: "https://evil.example" })).toMatch(/trang web khác/);
    expect(localRequestProblem("POST", { host: "localhost:8787", "content-type": "text/plain" })).toMatch(/JSON/);
    expect(localRequestProblem("GET", { host: "evil.example:8787" })).toMatch(/localhost/);
    expect(localRequestProblem("GET", { host: "127.0.0.1:8787" })).toBeNull();
  });

  let s: TestServer;
  beforeEach(async () => {
    s = await createTestServer();
  });
  afterEach(async () => {
    await s.cleanup();
  });

  it("POST chạy workflow từ origin lạ bị 403, không tạo run", async () => {
    await s.app.inject({ method: "GET", url: "/api/workflows/default" });
    const res = await s.app.inject({
      method: "POST",
      url: "/api/workflows/default/runs",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      payload: "{}",
    });
    expect(res.statusCode).toBe(403);
    expect(await s.deps.queue.processNext()).toBe(false);
  });
});
