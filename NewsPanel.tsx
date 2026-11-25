"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, api, pct, timeAgo, toneClass } from "./ui";
import { UNIVERSE } from "@/lib/market/universe";

type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  sentiment: number;
  symbols: string[];
};

type NewsData = { items: NewsItem[]; sentiment: Record<string, number>; updatedAt: string };

export default function NewsPanel({ onSelectSymbol }: { onSelectSymbol?: (symbol: string) => void }) {
  const [data, setData] = useState<NewsData | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<NewsData>("/api/news"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load news");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  const items = (data?.items ?? []).filter((i) => filter === "ALL" || i.symbols.includes(filter));

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card title="Sentiment by symbol" right={<span className="text-[11px] text-slate-500">last 24h</span>}>
        <div className="space-y-1">
          <button
            onClick={() => setFilter("ALL")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${filter === "ALL" ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60"}`}
          >
            All headlines
          </button>
          {UNIVERSE.map((a) => {
            const s = data?.sentiment[a.symbol] ?? 0;
            const label = s > 0.2 ? "Bullish" : s < -0.2 ? "Bearish" : "Neutral";
            const color = s > 0.2 ? "green" : s < -0.2 ? "red" : "slate";
            return (
              <button
                key={a.symbol}
                onClick={() => setFilter(a.symbol)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${filter === a.symbol ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60"}`}
              >
                <span>
                  {a.symbol} <span className="text-[11px] text-slate-500">{a.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`tabular-nums text-xs ${toneClass(s)}`}>{s.toFixed(2)}</span>
                  <Badge color={color}>{label}</Badge>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title={`Headlines · ${items.length}`}
        right={
          data?.updatedAt ? <span className="text-[11px] text-slate-500">updated {timeAgo(data.updatedAt)}</span> : null
        }
      >
        {error && <div className="mb-2 text-xs text-rose-400">{error}</div>}
        {!data && !error && <div className="text-sm text-slate-500">Loading headlines…</div>}
        {data && items.length === 0 && (
          <div className="text-sm text-slate-500">No headlines for this filter right now. Feeds refresh every 10 minutes.</div>
        )}
        <div className="divide-y divide-slate-800">
          {items.map((item) => {
            const tone = item.sentiment > 0.2 ? "green" : item.sentiment < -0.2 ? "red" : "slate";
            return (
              <article key={item.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium leading-snug text-slate-100 hover:text-emerald-300"
                  >
                    {item.title}
                  </a>
                  <Badge color={tone}>{item.sentiment > 0.2 ? "bullish" : item.sentiment < -0.2 ? "bearish" : "neutral"}</Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>{item.source}</span>
                  <span>·</span>
                  <span>{timeAgo(item.publishedAt)}</span>
                  {item.symbols.map((s) => (
                    <button
                      key={s}
                      onClick={() => onSelectSymbol?.(s)}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                    >
                      {s}
                    </button>
                  ))}
                  {item.symbols.length === 0 && <span className="text-slate-600">market-wide</span>}
                </div>
              </article>
            );
          })}
        </div>
        {data && (
          <div className="mt-2 text-[11px] text-slate-600">
            Sentiment is a keyword score on each headline, from −1 (bearish) to +1 (bullish). Buys are skipped when a
            symbol&apos;s recent headlines score −0.5 or lower.
          </div>
        )}
      </Card>
    </div>
  );
}
