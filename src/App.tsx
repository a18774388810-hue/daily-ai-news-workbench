import { useEffect, useMemo, useState } from "react";
import { Archive, Check, ChevronDown, ChevronUp, CircleAlert, Copy, Download, ExternalLink, FileJson, FileText, Heart, History, LayoutDashboard, Menu, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { createDemoState, sections } from "./data/parser";
import type { ApiConfig, FeishuStatus, NewsItem, Page, ReportsState, ReportState } from "./types";

const STORAGE_KEY = "daily-ai-news-workbench-v2";
const CONFIG_KEY = "daily-ai-news-api-config-v1";
const DEFAULT_CONFIG: ApiConfig = { endpoint: "https://api.openai.com/v1/chat/completions", model: "", enableWebSearch: false };
const stages = ["提交生成请求", "等待模型检索与整理", "校验来源和结构", "保存日报"];
const today = new Date().toLocaleDateString("sv-SE");

function loadReports(): ReportsState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* use seed */ }
  const seed = createDemoState();
  return { reports: { [seed.date]: seed }, selectedDate: today };
}
function loadConfig(): ApiConfig {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") }; }
  catch { return DEFAULT_CONFIG; }
}
function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
function toMarkdown(report: ReportState) {
  const groups = sections.map((section) => {
    const items = report.items.filter((item) => item.section === section && item.included);
    return `# ${section}\n\n${items.map((item, i) => `## ${i + 1}. ${item.title}\n\n- **日期：** ${item.date}\n- **发生了什么：** ${item.summary}\n- **为什么值得关注：** ${item.value}\n- **对电商博主/企业的意义：** ${item.meaning}\n- **来源：** ${item.sources.map((source) => `[${source.name}](${source.url})`).join("；")}`).join("\n\n")}`;
  }).join("\n\n");
  const count = report.items.filter((item) => item.included).length;
  return `# AI 技术要闻｜${report.date}\n\n> 共 ${count} 条已纳入内容。${report.warnings.length ? `\n> 注意：${report.warnings.join("；")}` : ""}\n\n${groups}`;
}
async function apiJson(url: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("无法连接本机生成服务，请确认工作台服务仍在运行后重试");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`);
  return body;
}

export default function App() {
  const [store, setStore] = useState<ReportsState>(loadReports);
  const [config, setConfig] = useState<ApiConfig>(loadConfig);
  const [apiKey, setApiKey] = useState("");
  const [feishu, setFeishu] = useState<FeishuStatus>({ configured: false, authenticated: false });
  const [page, setPage] = useState<Page>("today");
  const [section, setSection] = useState("全部板块");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");

  const report = store.reports[store.selectedDate];
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(store)), [store]);
  useEffect(() => localStorage.setItem(CONFIG_KEY, JSON.stringify(config)), [config]);
  useEffect(() => { apiJson("/api/feishu/status").then(setFeishu).catch(() => undefined); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);

  const filtered = useMemo(() => (report?.items ?? []).filter((item) => (section === "全部板块" || item.section === section) && (!query || `${item.title}${item.summary}${item.value}`.toLowerCase().includes(query.toLowerCase()))), [report, section, query]);
  const updateReport = (next: ReportState) => setStore((old) => ({ ...old, reports: { ...old.reports, [next.date]: next } }));
  const updateItem = (item: NewsItem) => report && updateReport({ ...report, items: report.items.map((entry) => entry.id === item.id ? { ...item, edited: true } : entry) });
  const selectDate = (date: string) => { setStore((old) => ({ ...old, selectedDate: date })); setExpanded(null); setSection("全部板块"); setQuery(""); };
  const navigate = (next: Page) => { setPage(next); setSidebarOpen(false); };

  async function generate() {
    if (!apiKey || !config.model.trim()) { navigate("settings"); setToast("请先填写模型、API Key"); return; }
    setGenerating(true); setStage(0);
    const timers = [window.setTimeout(() => setStage(1), 500), window.setTimeout(() => setStage(2), 2500)];
    try {
      const generated = await apiJson("/api/generate", { method: "POST", headers: { "content-type": "application/json", "x-user-api-key": apiKey }, body: JSON.stringify({ date: store.selectedDate, ...config }) });
      setStage(3);
      updateReport({ ...generated, source: "generated" });
      setToast(`已生成 ${generated.items.length} 条，${generated.warnings.length} 条提示`);
    } catch (error) { setToast(error instanceof Error ? error.message : "生成失败"); }
    finally { timers.forEach(clearTimeout); setGenerating(false); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}><div className="brand"><div className="brand-mark">AI</div><div><strong>每日 AI 要闻</strong><span>内容审核工作台</span></div></div><nav>
      <NavButton icon={<LayoutDashboard />} label="日报工作台" active={page === "today"} onClick={() => navigate("today")} />
      <NavButton icon={<History />} label="历史日报" active={page === "history"} onClick={() => navigate("history")} />
      <NavButton icon={<Archive />} label="选题库" active={page === "topics"} onClick={() => navigate("topics")} />
      <NavButton icon={<Settings />} label="设置" active={page === "settings"} onClick={() => navigate("settings")} />
    </nav><div className="sidebar-status"><span className="status-dot" />本地多日报已保存<small>API Key 不持久化</small></div></aside>
    {sidebarOpen && <button className="scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <main><header className="mobile-header"><button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="打开导航"><Menu /></button><strong>每日 AI 要闻</strong></header>
      {page === "today" && <TodayPage report={report} date={store.selectedDate} setDate={selectDate} filtered={filtered} section={section} setSection={setSection} query={query} setQuery={setQuery} expanded={expanded} setExpanded={setExpanded} setEditing={setEditing} updateItem={updateItem} generate={generate} generating={generating} stage={stage} loadExample={() => { selectDate("2026-10-01"); setToast("已打开 2026-10-01 历史示例"); }} setExportOpen={setExportOpen} setPublishOpen={setPublishOpen} />}
      {page === "history" && <HistoryPage reports={store.reports} onOpen={(date) => { selectDate(date); navigate("today"); }} />}
      {page === "topics" && <TopicsPage report={report} updateReport={updateReport} />}
      {page === "settings" && <SettingsPage config={config} setConfig={setConfig} apiKey={apiKey} setApiKey={setApiKey} feishu={feishu} />}
    </main>
    {editing && <EditModal item={editing} onClose={() => setEditing(null)} onSave={(item) => { updateItem(item); setEditing(null); setToast("修改已保存到本机"); }} />}
    {report && exportOpen && <Modal title="导出当前日报" onClose={() => setExportOpen(false)}><p>文件使用当前日报日期、纳入状态和本地编辑结果。</p><div className="export-actions"><button onClick={() => { downloadFile(`AI技术要闻-${report.date}.md`, toMarkdown(report), "text/markdown"); setExportOpen(false); }}><FileText />Markdown</button><button onClick={() => { downloadFile(`AI技术要闻-${report.date}.json`, JSON.stringify(report, null, 2), "application/json"); setExportOpen(false); }}><FileJson />JSON</button></div></Modal>}
    {report && publishOpen && <PublishModal report={report} feishu={feishu} onClose={() => setPublishOpen(false)} onResult={(message) => setToast(message)} onPublished={() => updateReport({ ...report, published: true, publishedAt: new Date().toISOString() })} />}
    {toast && <div className="toast"><Check />{toast}</div>}
  </div>;
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>; }
function TodayPage(props: any) {
  const report: ReportState | undefined = props.report;
  const included = report?.items.filter((item) => item.included).length ?? 0;
  const edited = report?.items.filter((item) => item.edited).length ?? 0;
  const total = report?.items.length ?? 0;
  const secondary = report?.items.filter((item) => item.sources.some((source) => source.secondary)).length ?? 0;
  const sources = report?.items.reduce((sum, item) => sum + item.sources.length, 0) ?? 0;
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">{props.date}{report?.source === "example" ? " · 历史示例" : ""}</div><h1>AI 要闻审核</h1><p>选择日期后生成、审核、导出或发布到自己的飞书文档。</p></div><div className="top-actions"><input className="date-input" type="date" value={props.date} onChange={(event) => props.setDate(event.target.value)} /><button className="secondary" onClick={props.loadExample}>载入示例</button><button className="primary" onClick={props.generate} disabled={props.generating}><Sparkles />生成当天要闻</button>{report && <><button className="secondary" onClick={() => props.setPublishOpen(true)}><ShieldCheck />发布飞书</button><button className="secondary" onClick={() => props.setExportOpen(true)}><Download />导出</button></>}</div></div>
    {props.generating && <div className="generation-panel"><div className="generation-title"><RefreshCw className="spin" />生成请求处理中 <span>阶段为前端请求生命周期，不代表服务端细粒度进度</span></div><div className="steps">{stages.map((name, index) => <div className={index <= props.stage ? "done" : ""} key={name}><span>{index < props.stage ? <Check /> : index + 1}</span>{name}</div>)}</div></div>}
    {!report ? <div className="empty report-empty"><FileText /><strong>{props.date} 暂无日报</strong><span>配置模型后生成当天要闻，或载入 2026-10-01 历史示例。</span></div> : <>
      {report.warnings.length > 0 && <div className="notice warning"><CircleAlert /><div>{report.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div></div>}
      <div className="stats-strip"><Stat label="日报状态" value={report.published ? "已发布" : "待审核"} detail={report.source === "example" ? "历史示例" : "模型生成"} tone={report.published ? "green" : "amber"} /><Stat label="内容规模" value={`${total} 条`} detail={`${new Set(report.items.map((item) => item.section)).size}/8 个板块`} /><Stat label="信源统计" value={`${sources} 个链接`} detail={`${secondary} 条含二级信源`} /><Stat label="审核进度" value={`${included}/${total}`} detail={`${edited} 条已编辑`} /></div>
      <div className="review-bar"><div><strong>纳入进度</strong><span>{included}/{total} 已纳入 · {edited}/{total} 已编辑</span></div><div className="progress"><i style={{ width: `${total ? included / total * 100 : 0}%` }} /></div><div className="source-alert"><CircleAlert />{secondary} 条内容含二级信源，公开引用前建议复核</div></div>
      <div className="toolbar"><div className="tabs"><button className={props.section === "全部板块" ? "active" : ""} onClick={() => props.setSection("全部板块")}>全部 <span>{total}</span></button>{sections.map((name: string, index: number) => { const count = report.items.filter((item) => item.section === name).length; return <button className={props.section === name ? "active" : ""} onClick={() => props.setSection(name)} key={name}>{index + 1}. {name} <span>{count}</span></button>; })}</div><label className="search"><Search /><input value={props.query} onChange={(event: any) => props.setQuery(event.target.value)} placeholder="搜索标题或摘要" /></label></div>
      <div className="list-header"><span>当前显示 {props.filtered.length} 条</span><span>纳入状态自动保存</span></div><div className="news-list">{props.filtered.length ? props.filtered.map((item: NewsItem) => <NewsRow key={item.id} item={item} open={props.expanded === item.id} onToggle={() => props.setExpanded(props.expanded === item.id ? null : item.id)} onInclude={() => props.updateItem({ ...item, included: !item.included })} onEdit={() => props.setEditing(item)} />) : <EmptyState />}</div>
    </>}</div>;
}
function Stat({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: string }) { return <div className="stat"><span>{label}</span><strong className={tone}>{value}</strong><small>{detail}</small></div>; }
function NewsRow({ item, open, onToggle, onInclude, onEdit }: { item: NewsItem; open: boolean; onToggle: () => void; onInclude: () => void; onEdit: () => void }) { return <article className={`news-row ${!item.included ? "excluded" : ""}`}><div className="news-main"><button className="expand-button" onClick={onToggle} aria-label={open ? "收起" : "展开"}>{open ? <ChevronUp /> : <ChevronDown />}</button><div className="news-content"><div className="news-meta"><span>{item.section}</span><time>{item.date}</time>{item.sources.some((source) => source.secondary) && <b>二级信源</b>}{item.edited && <b className="edited">已编辑</b>}</div><h2>{item.title}</h2><p>{item.summary}</p></div><div className="row-actions"><button className={item.included ? "include active" : "include"} onClick={onInclude}>{item.included ? <Check /> : <X />}{item.included ? "已纳入" : "已排除"}</button><button className="secondary small" onClick={onEdit}>编辑</button></div></div>{open && <div className="news-detail"><Detail label="为什么值得关注" text={item.value} /><Detail label="对电商博主 / 企业的意义" text={item.meaning} /><div className="sources"><span>来源</span>{item.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.name}<ExternalLink /></a>)}</div></div>}</article>; }
function Detail({ label, text }: { label: string; text: string }) { return <div><strong>{label}</strong><p>{text}</p></div>; }
function EmptyState() { return <div className="empty"><Search /><strong>没有匹配内容</strong><span>请调整板块或搜索关键词。</span></div>; }
function HistoryPage({ reports, onOpen }: { reports: Record<string, ReportState>; onOpen: (date: string) => void }) { const list = Object.values(reports).sort((a, b) => b.date.localeCompare(a.date)); return <div className="page"><div className="page-heading"><div><div className="eyebrow">本机归档</div><h1>历史日报</h1><p>按日期保存生成结果、编辑与发布状态。</p></div></div><div className="history-table"><div className="table-head"><span>日期</span><span>内容</span><span>状态</span><span /></div>{list.map((report) => <div className="table-row" key={report.date}><div><strong>{report.date}</strong><small>{report.source === "example" ? "内置历史示例" : "模型生成"}</small></div><span>{report.items.filter((item) => item.included).length}/{report.items.length} 条已纳入</span><span className={`status ${report.published ? "published" : "draft"}`}>{report.published ? "已发布" : "审核中"}</span><button className="secondary" onClick={() => onOpen(report.date)}>打开日报</button></div>)}</div></div>; }
function TopicsPage({ report, updateReport }: { report?: ReportState; updateReport: (report: ReportState) => void }) { if (!report) return <div className="page"><div className="page-heading"><div><h1>可转化选题库</h1></div></div><div className="empty"><Archive /><strong>当前日期暂无日报</strong><span>生成或打开日报后查看选题。</span></div></div>; return <div className="page"><div className="page-heading"><div><div className="eyebrow">{report.date} · {report.topics.length} 个选题</div><h1>可转化选题库</h1><p>生成接口当前不虚构选题；历史示例保留原稿选题。</p></div></div><div className="topic-grid">{report.topics.map((topic, index) => <article className="topic-card" key={topic.id}><div className="topic-index">{String(index + 1).padStart(2, "0")}</div><h2>{topic.title}</h2><div><button className={topic.favorite ? "icon-button favorite" : "icon-button"} title="收藏" onClick={() => updateReport({ ...report, topics: report.topics.map((entry) => entry.id === topic.id ? { ...entry, favorite: !entry.favorite } : entry) })}><Heart fill={topic.favorite ? "currentColor" : "none"} /></button><button className="secondary" onClick={() => navigator.clipboard.writeText(topic.title)}><Copy />复制</button></div></article>)}</div>{!report.topics.length && <div className="empty"><Archive /><strong>暂无选题</strong><span>可在后续审核流程中补充。</span></div>}</div>; }
function SettingsPage({ config, setConfig, apiKey, setApiKey, feishu }: { config: ApiConfig; setConfig: (config: ApiConfig) => void; apiKey: string; setApiKey: (key: string) => void; feishu: FeishuStatus }) { return <div className="page"><div className="page-heading"><div><div className="eyebrow">连接与安全</div><h1>工作台设置</h1><p>API Key 仅保留在当前页面内存，刷新或关闭页面即清除。</p></div></div><section className="settings-section"><h2>OpenAI-compatible 模型</h2><div className="form settings-form"><label><span>Endpoint</span><input value={config.endpoint} onChange={(event) => setConfig({ ...config, endpoint: event.target.value })} /></label><label><span>Model</span><input value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} placeholder="例如支持联网检索的模型名" /></label><label><span>API Key</span><div className="key-row"><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅本次页面会话" /><button className="secondary" onClick={() => setApiKey("")} disabled={!apiKey}><Trash2 />删除</button></div></label><label className="check-row"><input type="checkbox" checked={config.enableWebSearch} onChange={(event) => setConfig({ ...config, enableWebSearch: event.target.checked })} /><span>向兼容服务请求 <code>web_search</code> 工具。仅在服务明确支持时启用。</span></label></div><div className="notice warning"><CircleAlert /><div><strong>密钥风险提示</strong><br />Key 会经当前服务器转发给你填写的 endpoint，不写入 localStorage、数据库或服务端日志，也不会由服务端返回。请只使用可信服务和可撤销的低权限 Key。</div></div><div className="integration-row"><div className="integration-icon"><Sparkles /></div><div><strong>本次页面 Key 状态</strong><p>{apiKey ? "已填写，可发起生成；刷新页面后清除。" : "未填写。"}</p></div><span className={`status ${apiKey ? "published" : "draft"}`}>{apiKey ? "会话中可用" : "未配置"}</span></div></section><section className="settings-section"><h2>飞书授权</h2><div className="integration-row"><div className="integration-icon"><ShieldCheck /></div><div><strong>写入用户自己的文档</strong><p>{feishu.configured ? "服务端已配置飞书应用。首次发布仍需选择创建新文档或提供自己的文档 URL/token。" : "服务端尚未配置飞书应用环境变量。"}</p></div>{feishu.authenticated ? <span className="status published">已授权</span> : <button className="button-link" onClick={() => { if (feishu.configured) window.location.assign("/api/feishu/login"); else window.alert("飞书登录尚未启用。请先在飞书开放平台创建网页应用，并在服务端配置 FEISHU_APP_ID、FEISHU_APP_SECRET、PUBLIC_BASE_URL；回调地址为 PUBLIC_BASE_URL/api/feishu/callback。配置完成并重启服务后即可授权。"); }}>登录飞书</button>}</div><div className="notice"><ShieldCheck />OAuth token 与目标文档 token 仅保存在当前 Node 进程内存会话；服务重启、会话过期或多实例切换后会丢失。</div></section></div>; }
function EditModal({ item, onClose, onSave }: { item: NewsItem; onClose: () => void; onSave: (item: NewsItem) => void }) { const [draft, setDraft] = useState(item); const fields: [keyof NewsItem, string, number][] = [["title", "标题", 1], ["summary", "发生了什么", 3], ["value", "为什么值得关注", 3], ["meaning", "实际意义", 3]]; return <div className="modal-backdrop"><div className="modal edit-modal"><div className="modal-header"><div><span>{item.section}</span><h2>编辑新闻内容</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="form">{fields.map(([key, label, rows]) => <label key={key as string}><span>{label}</span>{rows === 1 ? <input value={draft[key] as string} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /> : <textarea rows={rows} value={draft[key] as string} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}</label>)}</div><div className="modal-footer"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!draft.title.trim() || !draft.summary.trim()} onClick={() => onSave(draft)}>保存修改</button></div></div></div>; }
function PublishModal({ report, feishu, onClose, onResult, onPublished }: { report: ReportState; feishu: FeishuStatus; onClose: () => void; onResult: (message: string) => void; onPublished: () => void }) { const [doc, setDoc] = useState(feishu.targetDocToken ?? ""); const [createNew, setCreateNew] = useState(!doc); const [busy, setBusy] = useState(false); const submit = async () => { setBusy(true); try { await apiJson("/api/feishu/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: report.date, markdown: toMarkdown(report), docUrlOrToken: doc, createNew }) }); onPublished(); onResult("飞书发布成功"); onClose(); } catch (error) { onResult(error instanceof Error ? error.message : "发布失败"); } finally { setBusy(false); } }; return <Modal title="发布到飞书" onClose={onClose}><p>只会写入你授权账号下选择的文档。当前实现不会使用任何预置私有 token。</p>{!feishu.authenticated ? <div className="notice warning"><CircleAlert />请先到设置页登录飞书。</div> : <div className="form"><label className="check-row"><input type="radio" checked={createNew} onChange={() => setCreateNew(true)} /><span>创建新文档</span></label><label className="check-row"><input type="radio" checked={!createNew} onChange={() => setCreateNew(false)} /><span>写入已有文档</span></label>{!createNew && <label><span>自己的飞书文档 URL 或 token</span><input value={doc} onChange={(event) => setDoc(event.target.value)} /></label>}<div className="modal-footer"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy || (!createNew && !doc.trim())} onClick={submit}>{busy ? "发布中" : "确认发布"}</button></div></div>}</Modal>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X /></button></div><div className="modal-body">{children}</div></div></div>; }
