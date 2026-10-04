# Daily AI News Workbench

可本机或 Node 服务器运行的 Vite + React + TypeScript 全栈应用。应用保留 `2026-10-01` 的 40 条历史示例，但不会虚构其他日期；用户可用自己的 OpenAI-compatible 模型生成、编辑、导出日报，并在飞书授权后选择自己的目标文档。

## 功能

- 多日报：按日期保存生成结果、编辑状态和发布状态，历史页可打开任一日报。
- 历史种子：仅预置 `2026-10-01` 示例；空日期保持空状态。
- 模型生成：`POST /api/generate` 验证八个固定板块、必填字段、HTTP(S) 来源 URL 并去重。目标为 8 板块各 5 条，不足 40 条会原样保留并返回 warnings。
- 本地工作：未登录也可生成、编辑和导出 Markdown/JSON。
- 飞书流程：OAuth 状态、登录、回调、目标文档选择和创建新文档流程已实现。
- 安全限制：API Key 不写 localStorage、数据库或日志，不由服务端返回；仅随单次请求传给 Node 服务，并由 Node 转发至用户配置的 endpoint。

## 环境要求与运行

需要 Node.js 20 或更高版本（使用内置 `fetch`、测试运行器和 `--watch`）。

```bash
git clone <本仓库地址>
cd daily-ai-news-workbench-public
npm install
npm run dev
```

`npm run dev` 同时启动 Node API（默认 `http://localhost:8787`）和 Vite。Vite 开发服务器会把 `/api` 代理到 Node；也可分别运行：

```bash
npm run dev:server
npm run dev:client
```

生产构建和本机启动：

```bash
npm run build
npm start
```

`npm start` 启动 Node 后端并托管 `dist/` 静态文件。通过 `PORT` 修改端口。

## 环境变量

```text
PORT=8787
FEISHU_APP_ID=
FEISHU_APP_SECRET=
PUBLIC_BASE_URL=http://localhost:8787
NODE_ENV=production
```

不要把 `.env`、API Key、Cookie、访问令牌或文档 token 提交到仓库。

## 模型 API

设置页保存 endpoint、model 和可选联网工具开关；API Key 只存在当前 React 页面内存，刷新或关闭页面即清除。默认 endpoint 是 `https://api.openai.com/v1/chat/completions`，可以修改。非本机 endpoint 必须使用 HTTPS；本机 `localhost`、`127.0.0.1`、`::1` 可使用 HTTP。

生成请求：

```http
POST /api/generate
x-user-api-key: <用户自己的 key>
content-type: application/json

{"date":"2026-10-03","endpoint":"https://api.openai.com/v1/chat/completions","model":"用户模型名","enableWebSearch":false}
```

服务端兼容常见 Chat Completions 响应 `choices[0].message.content`，要求内容为严格 JSON。启用 `enableWebSearch` 时会附加 `tools: [{"type":"web_search"}]`；这不是所有 OpenAI-compatible 服务都支持的通用字段，仅应在所用服务明确支持时启用。普通模型不一定能联网，协议要求无法检索时返回空 items；服务端不会用模型记忆或占位内容补足。

服务端限制包括：1 MB 入站请求、90 秒上游超时、2 MB 上游响应、endpoint 协议校验、来源 URL 协议白名单、错误信息截断和常见 Key 形式清洗。当前首版未实现限流，公网运行时应在反向代理层增加请求频率和并发限制。

## 数据与安全边界

- 日报、编辑和发布标记存储在当前浏览器 `localStorage`，清理站点数据会丢失。
- endpoint、model 和联网工具开关存储在 localStorage；API Key 不存储。
- Key 从浏览器经当前 Node 服务转发到用户填写的第三方 endpoint。服务器运营者仍可在进程或网络层观察请求，因此仅应使用可信服务器、HTTPS 和可撤销的低权限 Key。
- Node 代码不会记录请求 header、请求体或 Key，也不会把 Key写入响应。
- 飞书 access token、refresh token 和目标文档 token 只保存在 Node 进程内存会话。服务重启、会话过期或多实例切换后会丢失；首版不适合无共享会话的多实例部署。

## 飞书应用配置

1. 在飞书开放平台创建应用，并启用用户身份 OAuth 与云文档相关权限。
2. 在应用后台添加回调地址：`${PUBLIC_BASE_URL}/api/feishu/callback`。本机示例为 `http://localhost:8787/api/feishu/callback`。
3. 配置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`PUBLIC_BASE_URL` 后重启服务。
4. 设置页点击“登录飞书”。发布时首次必须选择“创建新文档”或提供用户自己的飞书 docx 文档 URL/token。

OAuth 端点和字段集中在 `server/feishu.js`，按飞书开放平台通用 v2 OAuth 结构实现。由于本项目没有用户的真实飞书应用和授权环境，端点、权限范围、令牌字段及回调配置尚未进行端到端验证，必须按实际应用后台文档复核。

当前正文写入不会伪装成功：OAuth、目标文档选择与创建文档请求已实现，但 docx block 顶部插入的最终 API 字段尚未在真实应用中验证，因此 `POST /api/feishu/publish` 会返回 `501 FEISHU_WRITE_ADAPTER_PENDING`。待验证后应只在 `server/feishu.js` 中补全写入适配；预期策略是在文档顶部插入当前日期内容，实现日期倒序。

## API

- `GET /api/health`：健康检查。
- `POST /api/generate`：使用请求 header 中的用户 Key 生成并校验日报。
- `GET /api/feishu/status`：返回是否配置、是否授权及当前会话是否选择目标文档，不返回 OAuth token。
- `GET /api/feishu/login`：发起飞书 OAuth。
- `GET /api/feishu/callback`：校验随机 state 并交换用户 token。
- `POST /api/feishu/publish`：检查授权和目标文档；正文适配未验证时明确返回 501。

## 测试

```bash
npm test
npm run build
```

测试覆盖模型 JSON 响应解析、重复项移除、板块和 URL 校验，以及真实启动 Node 服务后的健康检查。

`SKILL.md` 与 `references/api_reference.md` 继续保留为原 WorkBuddy Skill 资料。项目不会依赖 `lark-cli` 或用户本机登录状态。

## License

MIT License，详见 `LICENSE`。
