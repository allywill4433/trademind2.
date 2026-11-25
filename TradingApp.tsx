"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, api } from "./ui";
import Dashboard from "./Dashboard";
import MarketsPanel from "./MarketsPanel";
import AgentPanel from "./AgentPanel";
import PortfolioPanel from "./PortfolioPanel";
import NewsPanel from "./NewsPanel";
import SocialPanel from "./SocialPanel";
import SettingsPanel from "./SettingsPanel";
import AgentsPanel from "./AgentsPanel";
import AssistantPanel from "./AssistantPanel";
import LabPanel from "./LabPanel";
import IntelligencePanel from "./IntelligencePanel";
import AlertsPanel from "./AlertsPanel";
import FinancialPanel from "./FinancialPanel";
import InstallBanner from "./InstallBanner";

type Tab =
  | "dashboard"
  | "markets"
  | "agent"
  | "agents"
  | "assistant"
  | "lab"
  | "intelligence"
  | "portfolio"
  | "financial"
  | "alerts"
  | "news"
  | "community"
  | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "markets", label: "Markets & charts" },
  { id: "assistant", label: "AI assistant" },
  { id: "agents", label: "Agents" },
  { id: "agent", label: "Trading AI" },
  { id: "lab", label: "Strategy lab" },
  { id: "intelligence", label: "Intelligence" },
  { id: "portfolio", label: "Portfolio" },
  { id: "financial", label: "Financial" },
  { id: "alerts", label: "Alerts" },
  { id: "news", label: "News" },
  { id: "community", label: "Community" },
  { id: "settings", label: "Settings & brokers" },
];

type Header = { mode: "paper" | "live"; agentEnabled: boolean; killSwitch: boolean };

export default function TradingApp() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [header, setHeader] = useState<Header | null>(null);

  const loadHeader = useCallback(async () => {
    try {
      const d = await api<{ config: Header }>("/api/settings");
      setHeader(d.config);
    } catch {
      /* header is non-critical */
    }
  }, []);

  useEffect(() => {
    loadHeader();
    const t = setInterval(loadHeader, 15_000);
    return () => clearInterval(t);
  }, [loadHeader]);

  function navigate(next: string, sym?: string) {
    if (sym) setSymbol(sym);
    setTab(next as Tab);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const isLive = header?.mode === "live";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <InstallBanner />
      {isLive && (
        <div className="bg-rose-600 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-white">
          LIVE MODE: orders go to your real broker account. Switch to Paper in Settings to practice with fake money.
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 text-sm font-black text-slate-950">
              TM
            </div>
            <div>
              <div className="text-base font-semibold leading-tight">TradeMind AI</div>
              <div className="text-[11px] text-slate-500">Stocks + crypto · 24/7 · self-learning agent</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {header && (
              <Badge color={header.mode === "live" ? "red" : "green"}>
                {header.mode === "live" ? "Live · real money" : "Paper · fake money"}
              </Badge>
            )}
            {header && (
              <Badge color={header.killSwitch ? "red" : header.agentEnabled ? "green" : "amber"}>
                {header.killSwitch ? "Kill switch on" : header.agentEnabled ? "AI running" : "AI paused"}
              </Badge>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id ? "bg-slate-800 text-white ring-1 ring-slate-700" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {tab === "dashboard" && <Dashboard onNavigate={navigate} />}
        {tab === "markets" && (
          <MarketsPanel mode={header?.mode ?? "paper"} killSwitch={header?.killSwitch ?? false} focusSymbol={symbol} />
        )}
        {tab === "assistant" && <AssistantPanel />}
        {tab === "agents" && <AgentsPanel />}
        {tab === "agent" && <AgentPanel />}
        {tab === "lab" && <LabPanel />}
        {tab === "intelligence" && <IntelligencePanel />}
        {tab === "portfolio" && <PortfolioPanel />}
        {tab === "financial" && <FinancialPanel />}
        {tab === "alerts" && <AlertsPanel />}
        {tab === "news" && <NewsPanel onSelectSymbol={(s) => navigate("markets", s)} />}
        {tab === "community" && <SocialPanel focusSymbol={symbol} />}
        {tab === "settings" && <SettingsPanel onSaved={loadHeader} />}
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-8 pt-2 text-[11px] leading-relaxed text-slate-600">
        Not financial advice. Trading can lose money, including all of it. Paper results and backtests are simulated and
        do not guarantee future returns. Start in paper mode, and only trade money you can afford to lose.
      </footer>
    </div>
  );
}
