import crypto from "node:crypto";

const AUTHORIZE_URL = "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
const TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const CREATE_DOC_URL = "https://open.feishu.cn/open-apis/docx/v1/documents";
const sessions = new Map();

function config() {
  return {
    appId: process.env.FEISHU_APP_ID ?? "",
    appSecret: process.env.FEISHU_APP_SECRET ?? "",
    baseUrl: (process.env.PUBLIC_BASE_URL ?? "http://localhost:8787").replace(/\/$/, ""),
  };
}

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
}

export function getSession(request, response, create = true) {
  const cookies = parseCookies(request.headers.cookie);
  let id = cookies.ai_news_session;
  if (!id || !sessions.has(id)) {
    if (!create) return null;
    id = crypto.randomBytes(24).toString("base64url");
    sessions.set(id, { createdAt: Date.now() });
    response.setHeader("Set-Cookie", `ai_news_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  }
  return sessions.get(id);
}

export function status(request, response) {
  const session = getSession(request, response, false);
  const configured = Boolean(config().appId && config().appSecret && process.env.PUBLIC_BASE_URL);
  return { configured, authenticated: Boolean(session?.accessToken), targetDocToken: session?.targetDocToken ?? "" };
}

export function login(request, response) {
  const current = config();
  if (!current.appId || !current.appSecret || !process.env.PUBLIC_BASE_URL) throw new Error("飞书 OAuth 未配置，请设置 FEISHU_APP_ID、FEISHU_APP_SECRET 和 PUBLIC_BASE_URL");
  const session = getSession(request, response);
  session.oauthState = crypto.randomBytes(24).toString("base64url");
  session.oauthStateExpiresAt = Date.now() + 10 * 60_000;
  const redirectUri = `${current.baseUrl}/api/feishu/callback`;
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("app_id", current.appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", session.oauthState);
  response.writeHead(302, { location: url.toString() });
  response.end();
}

export async function callback(request, response, url) {
  const session = getSession(request, response, false);
  if (!session || !url.searchParams.get("state") || url.searchParams.get("state") !== session.oauthState || Date.now() > session.oauthStateExpiresAt) {
    throw new Error("OAuth state 无效或已过期");
  }
  const code = url.searchParams.get("code");
  if (!code) throw new Error("飞书回调缺少 code");
  const current = config();
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", client_id: current.appId, client_secret: current.appSecret, code, redirect_uri: `${current.baseUrl}/api/feishu/callback` }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) throw new Error("飞书令牌交换失败，请核对应用权限和回调配置");
  session.accessToken = tokenBody.access_token;
  session.refreshToken = tokenBody.refresh_token;
  session.tokenExpiresAt = Date.now() + Number(tokenBody.expires_in ?? 3600) * 1000;
  delete session.oauthState;
  delete session.oauthStateExpiresAt;
  response.writeHead(302, { location: `${current.baseUrl}/?feishu=connected` });
  response.end();
}

function parseDocToken(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/(?:docx|docs)\/([A-Za-z0-9_-]+)/);
    return match?.[1] ?? "";
  } catch {
    return /^[A-Za-z0-9_-]{8,}$/.test(value) ? value : "";
  }
}

async function createDocument(accessToken, title) {
  const response = await fetch(CREATE_DOC_URL, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ title }) });
  const body = await response.json().catch(() => ({}));
  const token = body?.data?.document?.document_id;
  if (!response.ok || !token) throw new Error("飞书文档创建失败；请核对 docx 文档权限及当前 v2 OAuth 用户令牌适配");
  return token;
}

export async function publish(request, response, payload) {
  const session = getSession(request, response, false);
  if (!session?.accessToken) return { status: 401, body: { error: "请先完成飞书授权" } };
  const date = typeof payload.date === "string" ? payload.date : "";
  const markdown = typeof payload.markdown === "string" ? payload.markdown : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !markdown || markdown.length > 1_000_000) return { status: 400, body: { error: "日报日期或内容无效" } };
  let token = parseDocToken(payload.docUrlOrToken);
  if (payload.createNew) token = await createDocument(session.accessToken, `AI 技术要闻｜${date}`);
  if (!token) return { status: 400, body: { error: "首次发布需提供自己的飞书文档 URL/token，或选择创建新文档" } };
  session.targetDocToken = token;

  return {
    status: 501,
    body: {
      error: "飞书正文写入适配待配置：OAuth、目标文档选择与创建流程已就绪，但需在实际飞书应用中核验 docx block 批量插入字段后启用。未写入文档，也未标记发布成功。",
      code: "FEISHU_WRITE_ADAPTER_PENDING",
      targetDocToken: token,
    },
  };
}
