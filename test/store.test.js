import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "ai-news-store-"));
process.env.DATA_DIR = dataDir;

const { readState, writeState, validateState, resolveClientId, parseCookies } = await import("../server/store.js");

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

const sample = { date: "2026-10-03", items: [{ id: "n1", section: "基础模型与多模态", title: "标题", date: "2026-10-03", summary: "s", value: "v", meaning: "m", sources: [], included: true, edited: false }], warnings: [], topics: [], published: false };

test("state 结构校验", () => {
  assert.equal(validateState({ reports: { "2026-10-03": sample }, selectedDate: "2026-10-03" }), null);
  assert.match(validateState(null), /对象/);
  assert.match(validateState({}), /reports/);
  assert.match(validateState({ reports: [] }), /reports/);
  assert.match(validateState({ reports: { "10-03": sample } }), /日期格式/);
  assert.match(validateState({ reports: { "2026-10-03": { date: "2026-10-03" } } }), /items/);
  assert.match(validateState({ reports: {}, selectedDate: "10/03" }), /selectedDate/);
});

test("日报可以写入并读回", () => {
  const clientId = "a".repeat(32);
  assert.equal(readState(clientId), null);
  const state = { reports: { "2026-10-03": sample }, selectedDate: "2026-10-03" };
  const bytes = writeState(clientId, state);
  assert.ok(bytes > 0);
  const back = readState(clientId);
  assert.equal(back.selectedDate, "2026-10-03");
  assert.equal(back.reports["2026-10-03"].items.length, 1);
});

test("重复写入同一日期不会累积残留文件", () => {
  const clientId = "b".repeat(32);
  writeState(clientId, { reports: { "2026-10-03": sample }, selectedDate: "2026-10-03" });
  writeState(clientId, { reports: { "2026-10-03": sample, "2026-10-04": { ...sample, date: "2026-10-04" } }, selectedDate: "2026-10-04" });
  const back = readState(clientId);
  assert.deepEqual(Object.keys(back.reports).sort(), ["2026-10-03", "2026-10-04"]);
});

test("不同客户端互不干扰", () => {
  const one = "c".repeat(32);
  const two = "d".repeat(32);
  writeState(one, { reports: { "2026-10-03": sample }, selectedDate: "2026-10-03" });
  assert.equal(readState(two), null);
});

test("非法客户端标识被拒绝", () => {
  assert.throws(() => writeState("../escape", { reports: {} }), /无效/);
  assert.throws(() => writeState("short", { reports: {} }), /无效/);
});

test("首次请求下发 Cookie 并复用已有标识", () => {
  const headers = {};
  const response = { getHeader: (k) => headers[k], setHeader: (k, v) => { headers[k] = v; } };
  const first = resolveClientId({ headers: {} }, response);
  assert.match(first, /^[a-f0-9]{32}$/);
  assert.match(String(headers["Set-Cookie"]), /^ai_news_client=/);

  const again = resolveClientId({ headers: { cookie: `ai_news_client=${first}` } }, { getHeader: () => undefined, setHeader: () => { throw new Error("不应重复下发 Cookie"); } });
  assert.equal(again, first);
});

test("Cookie 解析容错", () => {
  assert.deepEqual(parseCookies("a=1; b=2"), { a: "1", b: "2" });
  assert.deepEqual(parseCookies(""), {});
});
