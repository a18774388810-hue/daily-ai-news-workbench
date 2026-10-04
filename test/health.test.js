import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../server/app.js";

test("GET /api/health 返回健康状态", async (context) => {
  const server = createApp().listen(0, "127.0.0.1");
  context.after(() => server.close());
  await once(server, "listening");
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
