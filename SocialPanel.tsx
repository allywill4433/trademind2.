"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, api, clock, inputClass } from "./ui";
import { UNIVERSE } from "@/lib/market/universe";

type Post = {
  id: number;
  author: string;
  body: string;
  symbol: string | null;
  stance: string | null;
  source: "user" | "agent";
  likes: number;
  createdAt: string;
};

const STANCE_COLOR: Record<string, "green" | "red" | "slate"> = {
  bullish: "green",
  bearish: "red",
  neutral: "slate",
};

export default function SocialPanel({ focusSymbol }: { focusSymbol?: string | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [author, setAuthor] = useState("You");
  const [body, setBody] = useState("");
  const [symbol, setSymbol] = useState("");
  const [stance, setStance] = useState("neutral");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ posts: Post[] }>("/api/social");
      setPosts(d.posts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feed");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (focusSymbol) {
      setFilter(focusSymbol);
      setSymbol(focusSymbol);
    }
  }, [focusSymbol]);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/social", { action: "post", author, body, symbol, stance });
      setBody("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  async function like(id: number) {
    try {
      await api("/api/social", { action: "like", id });
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, likes: p.likes + 1 } : p)));
    } catch {
      /* ignore */
    }
  }

  const visible = posts.filter((p) => !filter || p.symbol === filter);

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card title="Share a trade idea">
          <div className="space-y-3">
            <input className={inputClass} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Name" maxLength={40} />
            <textarea
              className={`${inputClass} min-h-24`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What are you seeing on the chart?"
              maxLength={500}
            />
            <div className="grid grid-cols-2 gap-2">
              <select className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                <option value="">No symbol</option>
                {UNIVERSE.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol}
                  </option>
                ))}
              </select>
              <select className={inputClass} value={stance} onChange={(e) => setStance(e.target.value)}>
                <option value="bullish">Bullish</option>
                <option value="neutral">Neutral</option>
                <option value="bearish">Bearish</option>
              </select>
            </div>
            <Button variant="primary" className="w-full" disabled={busy || !body.trim()} onClick={submit}>
              Post
            </Button>
            {error && <div className="text-xs text-rose-400">{error}</div>}
          </div>
        </Card>
        <Card title="Filter">
          <select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All symbols</option>
            {UNIVERSE.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol}
              </option>
            ))}
          </select>
        </Card>
      </div>

      <Card title={`Community feed · ${visible.length}`}>
        <div className="space-y-3">
          {visible.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
              No posts yet. Share a setup, or wait for the agent to post its trades.
            </div>
          )}
          {visible.map((p) => (
            <article key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
                  {p.source === "agent" ? "AI" : p.author.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-100">{p.author}</span>
                {p.source === "agent" && <Badge color="violet">Agent</Badge>}
                {p.symbol && <Badge color="sky">{p.symbol}</Badge>}
                {p.stance && p.stance !== "neutral" && <Badge color={STANCE_COLOR[p.stance]}>{p.stance}</Badge>}
                <span className="ml-auto text-[11px] text-slate-500">{clock(p.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{p.body}</p>
              <div className="mt-2">
                <button
                  onClick={() => like(p.id)}
                  className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                >
                  ♥ {p.likes}
                </button>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
