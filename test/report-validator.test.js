import test from "node:test";
import assert from "node:assert/strict";
import { extractJsonContent, validateGeneratedReport } from "../server/report-validator.js";
import { validateEndpoint } from "../server/generate.js";

const valid = {
  id: "item-1", section: "基础模型与多模态", title: "可核验标题", date: "2026-10-03",
  summary: "摘要", value: "价值", meaning: "意义", sources: [{ name: "官方", url: "https://example.com/news", secondary: false }],
};

test("解析 OpenAI-compatible JSON 内容", () => {
  const result = extractJsonContent({ choices: [{ message: { content: "```json\n{\"items\":[],\"warnings\":[]}\n```" } }] });
  assert.deepEqual(result.items, []);
});

test("校验时去重并保留不足数量警告", () => {
  const result = validateGeneratedReport({ items: [valid, { ...valid, id: "item-2" }], warnings: [] }, "2026-10-03");
  assert.equal(result.items.length, 1);
  assert.match(result.warnings.join(" "), /重复/);
  assert.match(result.warnings.join(" "), /1\/40/);
});

test("移除非法板块和非 HTTP URL", () => {
  const result = validateGeneratedReport({ items: [valid, { ...valid, id: "bad-section", title: "错误板块", section: "其他" }, { ...valid, id: "bad-url", title: "错误链接", sources: [{ name: "坏链接", url: "javascript:alert(1)" }] }] }, "2026-10-03");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].section, "基础模型与多模态");
});

test("生成 endpoint 拦截私网和云元数据地址", () => {
  assert.throws(() => validateEndpoint("https://127.0.0.1/v1/chat/completions"), /私网|元数据/);
  assert.throws(() => validateEndpoint("https://169.254.169.254/latest/meta-data"), /私网|元数据/);
  assert.equal(validateEndpoint("https://api.openai.com/v1/chat/completions"), "https://api.openai.com/v1/chat/completions");
});
