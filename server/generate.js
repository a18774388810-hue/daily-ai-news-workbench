import { SECTIONS, extractJsonContent, validateGeneratedReport } from "./report-validator.js";

const UPSTREAM_TIMEOUT_MS = 120_000;
const SECTION_CONCURRENCY = 2;
const MAX_UPSTREAM_BYTES = 2_000_000;

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["0.0.0.0", "169.254.169.254", "metadata.google.internal"].includes(host)) return true;
  if (/^10\./.test(host) || /^127\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return false;
}

export function validateEndpoint(value) {
  const endpoint = new URL(value);
  const isLocalDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname.replace(/^\[|\]$/g, ""));
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLocalDevelopment)) {
    throw new Error("endpoint 必须使用 HTTPS；仅开发环境的本机地址允许 HTTP");
  }
  if (endpoint.username || endpoint.password) throw new Error("endpoint 不得包含用户名或密码");
  if (!isLocalDevelopment && isBlockedHost(endpoint.hostname)) throw new Error("endpoint 不得指向本机、私网或云元数据地址");
  return endpoint.toString();
}

function prompt(date, section) {
  return `你是严格的 AI 新闻资料整理器。为 ${date} 检索“${section}”板块的中文 AI 要闻。\n\n硬性规则：\n1. 优先检索目标日期最近 24 小时；不足 5 条时扩展到最近 72 小时，并填写真实发布日期。\n2. 只能采用你能够实际联网访问、核验并返回直接 URL 的公开信息。不能凭记忆编造新闻、日期、产品、数字或 URL。\n3. 只返回“${section}”板块，目标 5 条；不足时如实返回，不得凑数。\n4. 同一事件只能出现一次。来源 URL 必须为 http 或 https，优先官方公告、官方文档、GitHub Release、论文和权威媒体。\n5. 如果没有联网搜索/浏览能力，返回 {"items":[],"warnings":["当前模型无法联网检索可验证信源"]}。\n6. 仅返回严格 JSON，不要 Markdown。结构：{"items":[{"id":"稳定且唯一的短字符串","section":"${section}","title":"标题","date":"真实发布日期","summary":"发生了什么","value":"为什么值得关注","meaning":"对电商博主或企业的意义","sources":[{"name":"来源名","url":"https://...","secondary":false}]}],"warnings":["缺口或核验限制"]}。`;
}

async function readLimited(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_UPSTREAM_BYTES) {
      await reader.cancel();
      throw new Error("模型响应超过大小限制");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function cleanUpstreamError(status, body) {
  let message = "";
  try { message = JSON.parse(body)?.error?.message ?? ""; } catch { message = body; }
  message = String(message).replace(/(?:sk|key)-[A-Za-z0-9_-]{8,}/g, "[已隐藏]").slice(0, 400).trim();
  return `模型服务返回 ${status}${message ? `：${message}` : ""}`;
}

async function generateSection({ date, section, safeEndpoint, model, apiKey, enableWebSearch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const request = {
    model: model.trim(),
    messages: [
      { role: "system", content: "只输出可由直接来源 URL 核验的事实。无法联网时必须明确返回空 items，绝不推测。" },
      { role: "user", content: prompt(date, section) },
    ],
    temperature: 0.1,
  };
  if (enableWebSearch) request.tools = [{ type: "web_search" }];
  else request.response_format = { type: "json_object" };

  try {
    const response = await fetch(safeEndpoint, {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey.trim()}`, "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const body = await readLimited(response);
    if (!response.ok) throw new Error(cleanUpstreamError(response.status, body));
    let payload;
    try { payload = JSON.parse(body); } catch { throw new Error("模型服务返回了无效 JSON 响应"); }
    const raw = extractJsonContent(payload);
    return {
      items: Array.isArray(raw?.items) ? raw.items.filter((item) => item?.section === section) : [],
      warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "请求超时" : String(error?.message ?? error);
    return { items: [], warnings: [`${section}：${message}`] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateReport({ date, endpoint, model, apiKey, enableWebSearch }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("date 必须为 YYYY-MM-DD");
  if (typeof model !== "string" || !model.trim() || model.length > 200) throw new Error("model 不能为空");
  if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 10_000) throw new Error("缺少有效的 x-user-api-key");
  const safeEndpoint = validateEndpoint(endpoint);
  const results = [];

  for (let index = 0; index < SECTIONS.length; index += SECTION_CONCURRENCY) {
    const batch = SECTIONS.slice(index, index + SECTION_CONCURRENCY);
    results.push(...await Promise.all(batch.map((section) => generateSection({
      date, section, safeEndpoint, model, apiKey, enableWebSearch,
    }))));
  }

  return validateGeneratedReport({
    items: results.flatMap((result) => result.items),
    warnings: results.flatMap((result) => result.warnings),
  }, date);
}
