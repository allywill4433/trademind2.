"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, api, clock, inputClass, pct, toneClass } from "./ui";
import { STRATEGIES } from "@/lib/strategies";

type Decision = {
  id: number;
  title: string;
  asset: string | null;
  recommendation: string;
  confidence: number;
  reasoning: {
    whatWeBelieve?: string;
    evidenceFor?: string[];
    evidenceAgainst?: string[];
    assumptions?: string[];
    invalidation?: string;
  } | null;
  createdAt: string;
};

type Knowledge = {
  id: number;
  source: string;
  title: string;
  url: string | null;
  summary: string | null;
  tags: string[] | null;
  sentiment: number;
  verified: boolean;
  createdAt: string;
};

type Model = {
  id: string;
  label: string;
  provider: string;
  available: boolean;
  detail: string;
  runs: number;
  successRate: number | null;
  avgConfidence: number | null;
};

type LeaderRow = {
  strategy: string;
  assetClass: string;
  regime: string;
  trades: number;
  winRate: number;
  expectancyPct: number;
  kelly: number;
};

const REC_COLOR: Record<string, "green" | "red" | "amber" | "sky" | "slate"> = {
  buy: "green",
  sell: "red",
  hold: "slate",
  "no-trade": "amber",
  research: "sky",
};

const strategyName = (id: string) => STRATEGIES.find((s) => s.id === id)?.name ?? id;

export default function IntelligencePanel() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query = "") => {
    try {
      const d = await api<{ decisions: Decision[]; knowledge: Knowledge[]; models: Model[]; leaderboard: LeaderRow[] }>(
        `/api/intelligence${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      );
      setDecisions(d.decisions);
      setKnowledge(d.knowledge);
      setModels(d.models);
      setLeaderboard(d.leaderboard);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load intelligence");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(q), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Chief decisions & reasoning">
          <div className="max-h-[560px] space-y-3 overflow-auto pr-1">
            {decisions.length === 0 && <div className="text-sm text-slate-500">No decisions yet. The Chief logs a briefing every research cycle.</div>}
            {decisions.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={REC_COLOR[d.recommendation] ?? "slate"}>{d.recommendation}</Badge>
                  <span className="text-xs font-medium text-slate-200">{d.title}</span>
                  <span className="ml-auto text-[11px] text-slate-500">{clock(d.createdAt)}</span>
                </div>
                {d.reasoning && (
                  <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
                    {d.reasoning.whatWeBelieve && <div><span className="text-slate-200">Belief:</span> {d.reasoning.whatWeBelieve}</div>}
                    {d.reasoning.evidenceFor && d.reasoning.evidenceFor.length > 0 && (
                      <div><span className="text-emerald-300">For:</span> {d.reasoning.evidenceFor.join("; ")}</div>
                    )}
                    {d.reasoning.evidenceAgainst && d.reasoning.evidenceAgainst.length > 0 && (
                      <div><span className="text-rose-300">Against:</span> {d.reasoning.evidenceAgainst.join("; ")}</div>
                    )}
                    {d.reasoning.assumptions && d.reasoning.assumptions.length > 0 && (
                      <div><span className="text-slate-200">Assumptions:</span> {d.reasoning.assumptions.join("; ")}</div>
                    )}
                    {d.reasoning.invalidation && <div><span className="text-slate-200">Invalidated by:</span> {d.reasoning.invalidation}</div>}
                    <div>Confidence: <span className="text-slate-100">{(d.confidence * 100).toFixed(0)}%</span> (calibrated against outcomes, not invented)</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="AI model orchestration">
          <div className="space-y-2">
            {models.map((m) => (
              <div key={m.id} className="rounded-lg bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">{m.label}</span>
                  <Badge color={m.available ? "green" : "slate"}>{m.available ? "active" : "not configured"}</Badge>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{m.detail}</div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {m.runs > 0
                    ? `${m.runs} runs · success rate ${m.successRate !== null ? `${(m.successRate * 100).toFixed(0)}%` : "—"} · avg confidence ${m.avgConfidence !== null ? m.avgConfidence.toFixed(2) : "—"}`
                    : "No runs yet — quantitative tasks use the built-in core automatically."}
                </div>
              </div>
            ))}
            <div className="rounded-lg bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-500">
              Model agreement is one source of confidence, never proof. Add API keys in Settings to enable OpenAI,
              Anthropic, Gemini, or a local open-source model (Ollama). Without keys, the system runs entirely on its
              built-in quantitative models — and says so.
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Knowledge database"
        right={
          <div className="flex gap-2">
            <input
              className={inputClass}
              style={{ width: 220 }}
              placeholder="Search research…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(q)}
            />
            <Button onClick={() => load(q)}>Search</Button>
          </div>
        }
      >
        <div className="grid gap-2 md:grid-cols-2">
          {knowledge.length === 0 && <div className="text-sm text-slate-500">No knowledge items yet. Research cycles populate this database.</div>}
          {knowledge.map((k) => (
            <div key={k.id} className="rounded-lg bg-slate-950/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={k.source === "youtube" ? "red" : k.source === "trader" ? "violet" : k.source === "social" ? "amber" : "sky"}>
                  {k.source}
                </Badge>
                <Badge color={k.verified ? "green" : "amber"}>{k.verified ? "verified" : "unverified"}</Badge>
                <span className={`text-[11px] ${toneClass(k.sentiment)}`}>
                  sentiment {k.sentiment.toFixed(2)}
                </span>
                <span className="ml-auto text-[10px] text-slate-500">{clock(k.createdAt)}</span>
              </div>
              <div className="mt-1 text-xs font-medium leading-snug text-slate-200">
                {k.url ? (
                  <a href={k.url} target="_blank" rel="noreferrer" className="hover:text-emerald-300">{k.title}</a>
                ) : (
                  k.title
                )}
              </div>
              {k.summary && <div className="mt-1 line-clamp-3 text-[11px] leading-snug text-slate-400">{k.summary}</div>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="What the AI has learned (strategy memory)">
        {leaderboard.length === 0 ? (
          <div className="text-sm text-slate-500">No closed trades yet — the AI learns from every closed trade.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Strategy</th>
                  <th className="py-2 pr-3 font-medium">Market</th>
                  <th className="py-2 pr-3 font-medium">Regime</th>
                  <th className="py-2 pr-3 text-right font-medium">Trades</th>
                  <th className="py-2 pr-3 text-right font-medium">Win rate</th>
                  <th className="py-2 pr-3 text-right font-medium">Expectancy</th>
                  <th className="py-2 font-medium">AI verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leaderboard.map((r) => (
                  <tr key={`${r.strategy}-${r.assetClass}-${r.regime}`}>
                    <td className="py-2 pr-3 text-slate-200">{strategyName(r.strategy)}</td>
                    <td className="py-2 pr-3 text-slate-400">{r.assetClass}</td>
                    <td className="py-2 pr-3 text-slate-400">{r.regime}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.trades}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.winRate.toFixed(0)}%</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${toneClass(r.expectancyPct)}`}>{pct(r.expectancyPct)}</td>
                    <td className="py-2">
                      <Badge color={r.trades < 5 ? "amber" : r.kelly > 0 ? "green" : "red"}>
                        {r.trades < 5 ? "learning" : r.kelly > 0 ? "trusted" : "blocked"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
