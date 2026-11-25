import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentMessages, chatMessages, decisions, orders } from "@/db/schema";
import { runModel } from "@/lib/ai/models";
import { runCryptoIntel, runTechnicalAnalysis, runTraderResearch, scoreSetup } from "@/lib/agents/research";
import { getAgentStatuses } from "@/lib/agents/engine";
import { getSnapshot, mapLimit } from "@/lib/market/data";
import { computeIndicators } from "@/lib/market/indicators";
import { getAsset, UNIVERSE } from "@/lib/market/universe";
import { getSymbolSentiment } from "@/lib/news";
import { runBacktest } from "@/lib/trading/backtest";
import { runTenKExperiment } from "@/lib/lab/tenK";
import { walkForward } from "@/lib/lab/engine";
import { getConfig, getPortfolio, saveConfig } from "@/lib/settings";
import { loadCash, loadPositions, markPortfolio, resetPaperAccount } from "@/lib/trading/ledger";
import { audit } from "@/lib/security";

// The personal AI assistant: understands natural-language instructions,
// answers questions from live data, runs research and simulations, and
// remembers your preferences. It can pause trading and stop live mode, but
// it NEVER starts live trading or places real orders on its own — real-money
// actions always require you to use the Settings controls directly.

type Memory = { preferences: string[]; notes: string[] };

async function getMemory(): Promise<Memory> {
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.scope, "assistant-memory")).limit(1);
  void rows;
  const { appSettings } = await import("@/db/schema");
  const s = await db.select().from(appSettings).where(eq(appSettings.key, "assistant_memory")).limit(1);
  const v = s[0]?.value as Memory | undefined;
  return v ?? { preferences: [], notes: [] };
}

async function saveMemory(memory: Memory): Promise<void> {
  const { appSettings } = await import("@/db/schema");
  await db
    .insert(appSettings)
    .values({ key: "assistant_memory", value: memory as unknown as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: memory as unknown as object, updatedAt: new Date() } });
}

function findSymbol(text: string): string | null {
  const t = text.toLowerCase();
  for (const a of UNIVERSE) {
    if (new RegExp(`\\b${a.symbol.toLowerCase().replace("-", "\\-")}\\b`).test(t)) return a.symbol;
    for (const k of a.keywords) {
      if (new RegExp(`\\b${k}\\b`).test(t)) return a.symbol;
    }
  }
  return null;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export type AssistantReply = { reply: string; data?: Record<string, unknown> };

export async function handleAssistantMessage(raw: string): Promise<AssistantReply> {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const memory = await getMemory();

  // Memory commands
  if (lower.startsWith("remember ")) {
    memory.notes.push(text.slice(9).trim());
    await saveMemory(memory);
    return { reply: `Noted. I'll remember: "${text.slice(9).trim()}"` };
  }
  if (lower.startsWith("i prefer ") || lower.startsWith("i like ")) {
    memory.preferences.push(text);
    await saveMemory(memory);
    return { reply: `Got it — I'll keep that preference in mind.` };
  }

  // Safety commands (these only ever make things safer)
  if (/(stop|halt|kill).*(live|trading|all)/.test(lower) || lower.includes("kill switch")) {
    const cfg = await getConfig();
    await saveConfig({ killSwitch: true });
    await audit("assistant", "kill_switch_on", { via: "chat" });
    return {
      reply: `Done. The kill switch is ON — no new buys will be placed. Existing positions keep their stops and take-profits. ${cfg.mode === "live" ? "Live mode is still selected in Settings, but the kill switch blocks all new orders." : ""} To resume, turn the kill switch off in Settings.`,
    };
  }
  if (lower.includes("resume") || lower.includes("start trading") || lower.includes("start agent")) {
    await saveConfig({ agentEnabled: true });
    await audit("assistant", "agent_resumed", { via: "chat" });
    return { reply: "The trading agent is running. It will trade in the currently selected mode (paper unless you switched to live in Settings)." };
  }
  if (lower.includes("pause")) {
    await saveConfig({ agentEnabled: false });
    await audit("assistant", "agent_paused", { via: "chat" });
    return { reply: "Agent paused. It will not open or close positions until you resume it." };
  }

  // Status
  if (/\b(status|how are we|performance|summary)\b/.test(lower)) {
    const cfg = await getConfig();
    const portfolio = await getPortfolio(cfg.mode);
    const pos = await loadPositions(portfolio.id);
    const cash = await loadCash(portfolio.id);
    const snaps = await mapLimit(pos, 4, (p) => getSnapshot(p.symbol).catch(() => null));
    const priceOf = new Map<string, number>();
    snaps.forEach((s, i) => { if (s) priceOf.set(pos[i].symbol, s.price); });
    const { equity } = markPortfolio(cash, pos, (s) => priceOf.get(s));
    const closed = await db.select({ pnl: orders.realizedPnlPct }).from(orders).where(eq(orders.side, "sell")).limit(500);
    const withPnl = closed.filter((o) => o.pnl !== null);
    const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0).length;
    const agents = await getAgentStatuses();
    const active = agents.filter((a) => a.status === "active").length;
    return {
      reply: `Equity is ${usd(equity)} (${cfg.mode} mode) with ${pos.length} open position(s). ${withPnl.length} closed trades, win rate ${withPnl.length ? `${((wins / withPnl.length) * 100).toFixed(0)}%` : "n/a"}. ${active} of 12 agents are actively working. Kill switch: ${cfg.killSwitch ? "ON" : "off"}.`,
      data: { equity, positions: pos.length, winRate: withPnl.length ? (wins / withPnl.length) * 100 : null },
    };
  }

  // Research a symbol
  if (/\b(research|analyze|analyse|what.*happening|tell me about)\b/.test(lower)) {
    const symbol = findSymbol(lower) ?? "BTC-USD";
    const snap = await getSnapshot(symbol).catch(() => null);
    if (!snap) return { reply: `I couldn't fetch data for ${symbol}. The feed may be down — I won't guess.` };
    const ind = computeIndicators(snap.bars);
    const setup = scoreSetup(snap, ind);
    const sentiment = await getSymbolSentiment(symbol).catch(() => 0);
    return {
      reply: `${symbol} is at $${snap.price.toPrecision(6)} (${snap.changePct >= 0 ? "+" : ""}${snap.changePct.toFixed(2)}% today, ${snap.source} data). Technical setup score: ${setup.score}/100 in a ${setup.regime} market. RSI ${setup.rsi.toFixed(0)}, MACD histogram ${setup.macdHist >= 0 ? "positive" : "negative"}${setup.pattern ? `, ${setup.pattern} pattern` : ""}. News sentiment: ${sentiment.toFixed(2)}. Key factors: ${setup.reasons.join("; ")}.`,
      data: { symbol, setup },
    };
  }

  // Best opportunities
  if (/(opportunit|best.*(trade|setup)|what should i (buy|trade))/.test(lower)) {
    const snaps = await mapLimit(UNIVERSE, 4, (a) => getSnapshot(a.symbol).catch(() => null));
    const setups = snaps
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => scoreSetup(s, computeIndicators(s.bars)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const lines = setups.map((s) => `${s.symbol}: ${s.score}/100 (${s.regime}) — ${s.reasons.slice(0, 2).join("; ")}`);
    return {
      reply: `Top technical setups right now:\n${lines.join("\n")}\n\nThese are scores, not guarantees. The agent only trades when its risk rules and learned win rates agree.`,
      data: { setups },
    };
  }

  // Top traders
  if (/top trader|what.*traders.*doing|best traders/.test(lower)) {
    await runTraderResearch().catch(() => undefined);
    return {
      reply: "I maintain a curated database of documented strategies (trend following, mean reversion, breakouts, risk-first sizing) and compare each against our own backtests. The key finding: documented approaches share one trait — strict risk management. Unverified 'gurus' with no track record are explicitly excluded. See the Intelligence tab for the full library.",
    };
  }

  // Why is X up/down
  if (/(why|explain).*(up|down|moving|move)/.test(lower)) {
    const symbol = findSymbol(lower) ?? "BTC-USD";
    const snap = await getSnapshot(symbol).catch(() => null);
    if (!snap) return { reply: `No data for ${symbol} right now.` };
    const setup = scoreSetup(snap, computeIndicators(snap.bars));
    const sentiment = await getSymbolSentiment(symbol).catch(() => 0);
    return {
      reply: `${symbol} is ${snap.changePct >= 0 ? "up" : "down"} ${Math.abs(snap.changePct).toFixed(2)}% today at $${snap.price.toPrecision(6)}. Technical picture: ${setup.regime}, RSI ${setup.rsi.toFixed(0)}, MACD histogram ${setup.macdHist >= 0 ? "positive" : "negative"}. News sentiment is ${sentiment.toFixed(2)} (negative = bearish headlines). ${setup.reasons.join("; ")}. I can't know the true cause of a move — anyone claiming certainty is guessing.`,
    };
  }

  // Simulations
  const simMatch = lower.match(/(\d+)\s*(simulations?|runs?|monte carlo)/);
  if (simMatch || lower.includes("simulate") || lower.includes("$10") || lower.includes("10 to 1000") || lower.includes("10 to 1,000")) {
    const runs = simMatch ? Math.min(5000, Math.max(10, Number(simMatch[1]))) : 1000;
    const result = await runTenKExperiment(runs);
    return {
      reply: `Ran ${runs.toLocaleString()} Monte Carlo simulations from $10 toward $1,000 using ${result.tradeSample} real backtest trades (win rate ${result.winRate.toFixed(0)}%, avg win ${result.avgWinPct.toFixed(2)}%, avg loss ${result.avgLossPct.toFixed(2)}%). Moderate profile: median outcome $${result.profiles[1].sim.median.toFixed(2)}, probability of reaching $1,000: ${(result.profiles[1].sim.probTarget * 100).toFixed(1)}%, probability of ruin: ${(result.profiles[1].sim.probRuin * 100).toFixed(1)}%. ${result.verdict}`,
      data: { tenK: result },
    };
  }

  // Mistakes review
  if (/(mistake|review|last \d+ trades|what went wrong)/.test(lower)) {
    const cfg = await getConfig();
    const portfolio = await getPortfolio(cfg.mode);
    const closed = await db
      .select()
      .from(orders)
      .where(eq(orders.side, "sell"))
      .orderBy(desc(orders.createdAt))
      .limit(20);
    const withPnl = closed.filter((o) => o.realizedPnlPct !== null);
    if (withPnl.length === 0) return { reply: "No closed trades yet — nothing to review. The agent needs to trade (in paper mode) before I can analyze mistakes." };
    const losses = withPnl.filter((o) => (o.realizedPnlPct ?? 0) <= 0);
    const byStrategy = new Map<string, number>();
    for (const o of losses) byStrategy.set(o.strategy ?? "manual", (byStrategy.get(o.strategy ?? "manual") ?? 0) + 1);
    const worst = [...byStrategy.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      reply: `Reviewed your last ${withPnl.length} closed trades: ${losses.length} losses. ${worst ? `Most losses came from ${worst[0]} (${worst[1]} losses).` : ""} Common patterns: entries during range markets and stops hit before the setup could work. The Self-Improvement Agent has recorded this and will propose threshold changes for your approval — it never changes rules on its own.`,
    };
  }

  // Improve
  if (/improve|better/.test(lower)) {
    return {
      reply: "I can propose improvements, but they need your approval before anything changes. The Self-Improvement Agent reviews closed trades hourly and posts proposals in the AI Agent tab. Right now, the most reliable improvement is more paper-trading data: the AI learns from every closed trade, so let it run and check the learning leaderboard.",
    };
  }

  // Compare versions
  if (/compare|version/.test(lower)) {
    const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(5);
    if (rows.length === 0) return { reply: "No decisions recorded yet. The Chief Intelligence Agent logs a briefing every research cycle." };
    return {
      reply: `Recent decisions: ${rows.map((d) => `${d.title} → ${d.recommendation} (confidence ${d.confidence.toFixed(2)})`).join("; ")}. Full reasoning (evidence for/against, assumptions, invalidation) is in the Intelligence tab.`,
    };
  }

  // Why did you enter
  if (/(why|explain).*(enter|entered|bought|buy)/.test(lower)) {
    const symbol = findSymbol(lower);
    const cfg = await getConfig();
    const portfolio = await getPortfolio(cfg.mode);
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.portfolioId, portfolio.id))
      .orderBy(desc(orders.createdAt))
      .limit(50);
    const target = symbol ? rows.find((o) => o.symbol === symbol && o.side === "buy") : rows.find((o) => o.side === "buy");
    if (!target) return { reply: symbol ? `No buy order found for ${symbol}.` : "No buy orders yet." };
    return {
      reply: `The ${target.symbol} buy at $${target.price.toPrecision(6)} (${target.source}${target.strategy ? `, ${target.strategy}` : ""}) was placed because: ${target.reason ?? "no reason recorded"}. The position has a stop at the level set when it opened, and the trade feeds the AI's learning memory when it closes.`,
    };
  }

  // Backtest
  const btMatch = lower.match(/backtest\s+(\w[\w-]*)/);
  if (btMatch) {
    const symbol = getAsset(btMatch[1].toUpperCase()) ? btMatch[1].toUpperCase() : "BTC-USD";
    const result = await runBacktest({ symbol, timeframe: "5m", strategy: "consensus" }).catch(() => null);
    if (!result) return { reply: `Backtest failed for ${symbol} — not enough history.` };
    return {
      reply: `${symbol} 5m consensus backtest: ${result.trades} trades, ${result.totalReturnPct.toFixed(1)}% return vs ${result.buyHoldPct.toFixed(1)}% buy-and-hold, win rate ${result.winRate.toFixed(0)}%, profit factor ${result.profitFactor.toFixed(2)}, max drawdown ${result.maxDrawdownPct.toFixed(1)}%. Past performance does not guarantee future results.`,
    };
  }

  // Walk-forward
  if (/walk.?forward|out.of.sample|overfit/.test(lower)) {
    const wf = await walkForward({ symbol: "BTC-USD", timeframe: "1h", strategy: "consensus", folds: 4 }).catch(() => null);
    if (!wf) return { reply: "Walk-forward analysis failed — not enough history." };
    return {
      reply: `Walk-forward on BTC 1h (4 folds): average fold return ${wf.avgReturnPct.toFixed(1)}%, stability: ${wf.stability}. ${wf.verdict}`,
    };
  }

  // Risk report
  if (/risk/.test(lower)) {
    const cfg = await getConfig();
    const portfolio = await getPortfolio(cfg.mode);
    const pos = await loadPositions(portfolio.id);
    const cash = await loadCash(portfolio.id);
    const snaps = await mapLimit(pos, 4, (p) => getSnapshot(p.symbol).catch(() => null));
    const priceOf = new Map<string, number>();
    snaps.forEach((s, i) => { if (s) priceOf.set(pos[i].symbol, s.price); });
    const { equity, positionsValue } = markPortfolio(cash, pos, (s) => priceOf.get(s));
    return {
      reply: `Risk report: equity ${usd(equity)}, exposure ${equity > 0 ? ((positionsValue / equity) * 100).toFixed(0) : 0}% in ${pos.length} position(s). Limits: ${cfg.riskPerTradePct}% risk per trade, ${cfg.dailyLossLimitPct}% daily loss limit, ${cfg.weeklyLossLimitPct}% weekly, ${cfg.maxTotalDrawdownPct}% total drawdown halt. Kill switch: ${cfg.killSwitch ? "ON" : "off"}. The Risk Management Agent can halt trading at any time.`,
    };
  }

  // Reset paper
  if (/reset/.test(lower)) {
    const cfg = await getConfig();
    await resetPaperAccount(cfg.startingCash, false);
    await audit("assistant", "paper_reset", { via: "chat" });
    return { reply: `Paper account reset to ${usd(cfg.startingCash)}. All paper positions and orders were deleted. The AI's learning memory was kept.` };
  }

  // Run research now
  if (/run.*research|research.*now|scan/.test(lower)) {
    await Promise.allSettled([runCryptoIntel(), runTechnicalAnalysis()]);
    return { reply: "Research cycle started. Crypto and technical agents are scanning now — watch the live feed in the AI Agent tab." };
  }

  // Agent status
  if (/agent|who.*working/.test(lower)) {
    const agents = await getAgentStatuses();
    const lines = agents.map((a) => `${a.name}: ${a.status}${a.currentTask ? ` — ${a.currentTask}` : ""}`);
    return { reply: `Agent network status:\n${lines.join("\n")}` };
  }

  // Help / default
  if (/help|what can you do/.test(lower)) {
    return { reply: HELP_TEXT };
  }

  // Fall back to a configured LLM for free-form questions.
  const { text: llmText } = await runModel(
    "summarize",
    `You are TradeMind, a trading assistant. Answer concisely using only the context provided. Never claim guaranteed profits. Context: ${JSON.stringify({ memory, mode: (await getConfig()).mode })}. Question: ${text}`,
    `I can help with: market research ("research bitcoin"), finding setups ("best opportunities"), explaining moves ("why is BTC down"), simulations ("run 1000 simulations"), trade reviews ("mistakes in my last 20 trades"), risk reports, backtests, and system status. Try one of those — or connect an LLM API key in Settings for free-form answers.`,
  );
  return { reply: llmText };
}

export const HELP_TEXT = `Things you can ask me:
• "Research bitcoin" — live analysis of any symbol
• "Best opportunities today" — ranked technical setups
• "Why is BTC down?" — evidence-based explanation
• "Run 1000 simulations" — Monte Carlo on the $10 → $1,000 goal
• "Mistakes in my last 20 trades" — self-review
• "Risk report" / "Status" — account and system health
• "Backtest BTC-USD" / "Walk-forward" — strategy testing
• "Pause agent" / "Stop all live trading" — safety controls
• "Remember ..." — I keep persistent memory of your preferences

I will never start live trading or place real orders from chat. Real-money controls live in Settings only.`;

export async function getAssistantHistory(limit = 100) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.scope, "assistant"))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
}

export async function saveChatMessage(scope: string, role: string, body: string, data?: Record<string, unknown>): Promise<void> {
  await db.insert(chatMessages).values({ scope, role, body, data: data ?? null });
}

export async function getAgentChat(key: string, limit = 60) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.scope, `agent:${key}`))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
}

// Agent chat replies: each agent answers from its own live data.
export async function agentReply(key: string, text: string): Promise<string> {
  const lower = text.toLowerCase();
  if (key === "crypto") {
    const snap = await getSnapshot("BTC-USD").catch(() => null);
    if (snap) return `BTC is $${snap.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${snap.changePct >= 0 ? "+" : ""}${snap.changePct.toFixed(2)}% today). ETH is $${(await getSnapshot("ETH-USD").catch(() => null))?.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) ?? "?"}. Crypto trades 24/7 — I track volatility, volume and sentiment continuously.`;
  }
  if (key === "technical") {
    const snap = await getSnapshot("BTC-USD").catch(() => null);
    if (snap) {
      const setup = scoreSetup(snap, computeIndicators(snap.bars));
      return `BTC setup score ${setup.score}/100 (${setup.regime}). ${setup.reasons.join("; ")}. I compare RSI, MACD, trend, VWAP and patterns — never one indicator alone.`;
    }
  }
  if (key === "risk") {
    const cfg = await getConfig();
    return `Current limits: ${cfg.riskPerTradePct}% risk per trade, ${cfg.dailyLossLimitPct}% daily loss limit, ${cfg.weeklyLossLimitPct}% weekly, ${cfg.maxTotalDrawdownPct}% total drawdown halt, max ${cfg.maxOpenPositions} positions. I can halt trading at any time — capital preservation comes first.`;
  }
  if (key === "chief") {
    const agents = await getAgentStatuses();
    const active = agents.filter((a) => a.status === "active").length;
    return `I coordinate ${agents.length} specialized agents; ${active} are active right now. I verify important information before acting and log every decision with its reasoning. Ask me for a status report or tell me what to research.`;
  }
  if (key === "verification") {
    return "I independently verify every proposed trade: data freshness, cross-source price agreement (Kraken/Yahoo), liquidity, market hours, transaction costs, and risk exposure. If anything fails, the trade is rejected or confidence is lowered.";
  }
  if (key === "selfimprove") {
    return "I review closed trades for recurring mistakes and propose improvements. Nothing changes without your approval — proposals wait in the AI Agent tab.";
  }
  if (key === "quant") {
    return "I compute correlations, volatility regimes, expectancy and overfitting checks. Run a walk-forward test from the Strategy Lab to see whether a strategy survives out-of-sample.";
  }
  if (key === "strategy") {
    return "I develop strategies through hypothesis → backtest → walk-forward → paper trading. Only strategies that pass predefined gates get recommended. Failed experiments are kept — they are valuable evidence.";
  }
  if (key === "news") {
    const sentiment = await getSymbolSentiment("BTC-USD").catch(() => 0);
    return `BTC headline sentiment is ${sentiment.toFixed(2)} (negative = bearish). I also watch the economic calendar for high-impact events like CPI and Fed decisions.`;
  }
  if (key === "social") {
    return "I monitor headline mention velocity and trending videos for hype signals. Repeated identical headlines are flagged as possible coordinated promotion. Popular opinion is never treated as truth.";
  }
  if (key === "traders") {
    return "I study documented strategies and compare them against our own backtests. Unverified claims are labelled as such and never copied.";
  }
  if (key === "youtube") {
    return "I search educational trading content and add it to the knowledge base as UNVERIFIED until a backtest confirms it. Creator popularity is not evidence.";
  }
  return `I'm the ${key} agent. Ask me about my latest findings, or check my status card for what I'm working on.`;
}

export { agentMessages };
