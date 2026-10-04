import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COOKIE_NAME = "ai_news_client";
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function dataRoot() {
  return process.env.DATA_DIR || join(process.cwd(), "data");
}

function stateDir() {
  const dir = join(dataRoot(), "state");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

// 每个浏览器一个匿名存储分区：靠 Cookie 记住分区 ID。
// 用 Cookie 而不是 localStorage，是因为清空 localStorage 时 Cookie 往往还在，
// 这样「清缓存导致日报全丢」的情况就不会再发生。
export function resolveClientId(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  const existing = cookies[COOKIE_NAME];
  if (CLIENT_ID_PATTERN.test(existing ?? "")) return existing;

  const id = crypto.randomBytes(16).toString("hex");
  const previous = response.getHeader("Set-Cookie");
  const cookie = `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
  response.setHeader("Set-Cookie", previous ? [].concat(previous, cookie) : cookie);
  return id;
}

function stateFile(clientId) {
  if (!CLIENT_ID_PATTERN.test(clientId)) throw new Error("无效的存储分区标识");
  return join(stateDir(), `${clientId}.json`);
}

export function readState(clientId) {
  const file = stateFile(clientId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.reports !== "object" || parsed.reports === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeState(clientId, state) {
  const payload = JSON.stringify(state);
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes > MAX_STATE_BYTES) throw new Error("日报数据超过 8 MB 上限，请先导出并清理历史日期");

  const file = stateFile(clientId);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, payload, "utf8");
  renameSync(temp, file); // 原子替换，避免写入中断导致文件损坏
  return bytes;
}

export function validateState(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "请求体必须是对象";
  if (!body.reports || typeof body.reports !== "object" || Array.isArray(body.reports)) return "缺少 reports 对象";
  for (const [date, report] of Object.entries(body.reports)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `日报日期格式不合法：${date}`;
    if (!report || typeof report !== "object") return `日报 ${date} 内容不合法`;
    if (!Array.isArray(report.items)) return `日报 ${date} 缺少 items 数组`;
  }
  if (body.selectedDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.selectedDate))) return "selectedDate 格式不合法";
  return null;
}
