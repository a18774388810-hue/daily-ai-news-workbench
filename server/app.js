import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateReport } from "./generate.js";
import * as feishu from "./feishu.js";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");
const MAX_BODY_BYTES = 1_000_000;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon" };

export function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("请求体超过 1 MB 限制");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new Error("请求体不是有效 JSON"); }
}

function cleanError(error) {
  return String(error?.message ?? "服务端错误").replace(/(?:sk|key)-[A-Za-z0-9_-]{8,}/g, "[已隐藏]").slice(0, 600);
}

function serveStatic(request, response, url) {
  if (!existsSync(DIST)) return json(response, 503, { error: "前端尚未构建，请先运行 npm run build" });
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
  let path = join(DIST, relative || "index.html");
  if (!path.startsWith(DIST)) return json(response, 403, { error: "禁止访问" });
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(DIST, "index.html");
  response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream", "x-content-type-options": "nosniff" });
  createReadStream(path).pipe(response);
}

export function createApp() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { ok: true });
      if (request.method === "POST" && url.pathname === "/api/generate") {
        const payload = await readJson(request);
        const report = await generateReport({ ...payload, apiKey: request.headers["x-user-api-key"] });
        return json(response, 200, report);
      }
      if (request.method === "GET" && url.pathname === "/api/feishu/status") return json(response, 200, feishu.status(request, response));
      if (request.method === "GET" && url.pathname === "/api/feishu/login") return feishu.login(request, response);
      if (request.method === "GET" && url.pathname === "/api/feishu/callback") return await feishu.callback(request, response, url);
      if (request.method === "POST" && url.pathname === "/api/feishu/publish") {
        const result = await feishu.publish(request, response, await readJson(request));
        return json(response, result.status, result.body);
      }
      if (url.pathname.startsWith("/api/")) return json(response, 404, { error: "API 路由不存在" });
      if (request.method !== "GET" && request.method !== "HEAD") return json(response, 405, { error: "请求方法不允许" });
      return serveStatic(request, response, url);
    } catch (error) {
      const message = cleanError(error);
      const status = /请求体|date|model|endpoint|缺少有效|无效 JSON/.test(message) ? 400 : 502;
      return json(response, status, { error: message });
    }
  });
}
