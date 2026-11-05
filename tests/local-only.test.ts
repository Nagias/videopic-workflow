import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localRequestProblem } from "../src/app-server";
import { createTestServer, type TestServer } from "./helpers/server";

describe("chỉ nhận yêu cầu từ chính máy này (chống trang web lạ bấm Chạy hộ)", () => {
  it("localRequestProblem", () => {
    const json = { host: "localhost:8787", "content-type": "application/json" };
    expect(localRequestProblem("POST", json, "/api/workflows/default/runs")).toBeNull();
    expect(localRequestProblem("POST", { ...json, origin: "http://localhost:5173" }, "/api/workflows/default/runs")).toBeNull();
    expect(localRequestProblem("POST", { ...json, origin: "https://evil.example" }, "/api/workflows/default/runs")).toMatch(/trang web khác/);
    expect(localRequestProblem("POST", { host: "localhost:8787", "content-type": "text/plain" }, "/api/workflows/default/runs")).toMatch(/JSON/);
    expect(localRequestProblem("GET", { host: "evil.example:8787" }, "/api/media/x")).toMatch(/localhost/);
    expect(localRequestProblem("GET", { host: "127.0.0.1:8787" }, "/api/media/x")).toBeNull();
  });

  it("dữ liệu ảnh chỉ được nhận ở đường tải ảnh; Origin lạ vẫn bị chặn", () => {
    const png = { host: "localhost:8787", "content-type": "image/png" };
    expect(localRequestProblem("POST", png, "/api/media/upload")).toBeNull();
    expect(localRequestProblem("POST", png, "/api/workflows/default")).toMatch(/JSON/);
    expect(localRequestProblem("POST", { ...png, origin: "https://evil.example" }, "/api/media/upload")).toMatch(/trang web khác/);
    expect(localRequestProblem("POST", { host: "localhost:8787", "content-type": "text/plain" }, "/api/media/upload")).toMatch(/JSON|ảnh/);
    expect(localRequestProblem("POST", png, "/api/media/upload?x=1")).toBeNull();
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
