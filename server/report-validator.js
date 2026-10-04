export const SECTIONS = [
  "基础模型与多模态",
  "算力、开源与开发工具",
  "大厂、产品与生态",
  "AI 内容创作",
  "岗位提效与智能体",
  "AI 行业趋势",
  "AI + 电商企业",
  "AI + 商业",
];

const REQUIRED_TEXT = ["id", "section", "title", "date", "summary", "value", "meaning"];

function text(value, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function extractJsonContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("模型响应缺少 choices[0].message.content");
  const stripped = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error("模型未返回有效 JSON");
  }
}

export function validateGeneratedReport(raw, requestedDate) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) {
    throw new Error("生成结果必须是包含 items 数组的 JSON 对象");
  }

  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map((entry) => text(entry, 500)).filter(Boolean) : [];
  const items = [];
  const seen = new Set();
  let rejected = 0;

  for (const candidate of raw.items) {
    if (!candidate || typeof candidate !== "object") { rejected += 1; continue; }
    const normalized = Object.fromEntries(REQUIRED_TEXT.map((key) => [key, text(candidate[key])]));
    if (REQUIRED_TEXT.some((key) => !normalized[key]) || !SECTIONS.includes(normalized.section)) {
      rejected += 1;
      continue;
    }
    const sources = Array.isArray(candidate.sources) ? candidate.sources.map((source) => {
      const url = parseUrl(source?.url);
      const name = text(source?.name, 300);
      return url && name ? { name, url, secondary: Boolean(source?.secondary) } : null;
    }).filter(Boolean) : [];
    if (!sources.length) { rejected += 1; continue; }

    const dedupeKey = `${normalized.section}|${normalized.title.toLowerCase()}`;
    if (seen.has(dedupeKey)) { rejected += 1; continue; }
    seen.add(dedupeKey);
    items.push({
      ...normalized,
      id: normalized.id.slice(0, 200),
      date: normalized.date.slice(0, 100),
      sources,
      included: true,
      edited: false,
    });
  }

  if (rejected) warnings.push(`有 ${rejected} 条内容因字段、板块、信源 URL 无效或重复而被移除。`);
  if (items.length < 40) warnings.push(`仅获得 ${items.length}/40 条可验证内容，未使用虚构内容补足。`);
  if (!items.length) {
    throw new Error("模型未返回任何具备可验证来源的有效内容；请确认所用模型或服务具备联网搜索能力");
  }

  return {
    date: requestedDate,
    items,
    topics: [],
    warnings: [...new Set(warnings)],
    generatedAt: new Date().toISOString(),
    published: false,
  };
}
