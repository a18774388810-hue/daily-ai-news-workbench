import reportMarkdown from "./report-2026-10-01.md?raw";
import type { NewsItem, ReportState, Source, Topic } from "../types";

export const sections = [
  "基础模型与多模态",
  "算力、开源与开发工具",
  "大厂、产品与生态",
  "AI 内容创作",
  "岗位提效与智能体",
  "AI 行业趋势",
  "AI + 电商企业",
  "AI + 商业",
];

const strip = (value: string) => value.replace(/\*\*/g, "").trim();

function parseSources(value: string): Source[] {
  const sources: Source[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const nearby = value.slice(match.index, pattern.lastIndex + 12);
    sources.push({ name: match[1], url: match[2], secondary: /二级|线索|索引/.test(nearby) });
  }
  return sources;
}

function parseItems(): NewsItem[] {
  const body = reportMarkdown.split("# 可转化内容选题")[0];
  const lines = body.split("\n");
  const items: NewsItem[] = [];
  let section = "";
  let current: Partial<NewsItem> | null = null;

  const commit = () => {
    if (!current?.title || !section) return;
    items.push({
      id: `news-${items.length + 1}`,
      section,
      title: current.title,
      date: current.date ?? "",
      summary: current.summary ?? "",
      value: current.value ?? "",
      meaning: current.meaning ?? "",
      sources: current.sources ?? [],
      included: true,
      edited: false,
    });
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^# [一二三四五六七八]、(.+)$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const titleMatch = line.match(/^## \d+\. (.+)$/);
    if (titleMatch && section) {
      commit();
      current = { title: titleMatch[1].trim() };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^- \*\*(日期|发生了什么|为什么值得关注|对电商博主\/企业的意义|来源)：\*\*\s*(.*)$/);
    if (!field) continue;
    const value = strip(field[2]);
    if (field[1] === "日期") current.date = value;
    if (field[1] === "发生了什么") current.summary = value;
    if (field[1] === "为什么值得关注") current.value = value;
    if (field[1] === "对电商博主/企业的意义") current.meaning = value;
    if (field[1] === "来源") current.sources = parseSources(value);
  }
  commit();
  return items;
}

function parseTopics(): Topic[] {
  const source = reportMarkdown.split("# 可转化内容选题")[1]?.split("# 信源说明")[0] ?? "";
  return source
    .split("\n")
    .map((line) => line.match(/^\d+\. \*\*(.+)\*\*$/)?.[1])
    .filter((title): title is string => Boolean(title))
    .map((title, index) => ({ id: `topic-${index + 1}`, title, favorite: false }));
}

export function createDemoState(): ReportState {
  return {
    date: "2026-10-01",
    items: parseItems(),
    topics: parseTopics(),
    warnings: ["这是内置历史示例，不代表实时联网生成结果。"],
    published: false,
    source: "example",
  };
}

export const sourceMarkdown = reportMarkdown;
