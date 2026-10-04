export type Page = "today" | "history" | "topics" | "settings";

export type Source = { name: string; url: string; secondary: boolean };
export type NewsItem = {
  id: string; section: string; title: string; date: string; summary: string;
  value: string; meaning: string; sources: Source[]; included: boolean; edited: boolean;
};
export type Topic = { id: string; title: string; favorite: boolean };
export type ReportState = {
  date: string;
  items: NewsItem[];
  topics: Topic[];
  warnings: string[];
  generatedAt?: string;
  published: boolean;
  publishedAt?: string;
  source: "example" | "generated";
};
export type ReportsState = { reports: Record<string, ReportState>; selectedDate: string };
export type ApiConfig = { endpoint: string; model: string; enableWebSearch: boolean };
export type FeishuStatus = { configured: boolean; authenticated: boolean; targetDocToken?: string };
