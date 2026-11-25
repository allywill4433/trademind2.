import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, notifications, proposals, reminders } from "@/db/schema";
import { getSnapshot } from "@/lib/market/data";
import { getSymbolSentiment } from "@/lib/news";
import { getConfig, getPortfolio } from "@/lib/settings";
import { loadCash, loadPositions, markPortfolio } from "@/lib/trading/ledger";

// Alert rules engine. Generates notifications for market moves, volume spikes,
// sentiment shifts, risk warnings, agent failures, pending proposals and due
// reminders. Each rule is throttled so you are not spammed.

const THROTTLE_MS: Record<string, number> = {
  btc_move: 60 * 60_000,
  volume_spike: 2 * 60 * 60_000,
  sentiment: 4 * 60 * 60_000,
  risk: 30 * 60_000,
  agent_error: 60 * 60_000,
  proposal: 12 * 60 * 60_000,
  reminder: 60_000,
};

async function shouldNotify(kind: string): Promise<boolean> {
  const last = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(eq(notifications.kind, kind))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  if (!last[0]) return true;
  return Date.now() - last[0].createdAt.getTime() > (THROTTLE_MS[kind] ?? 60_000);
}

export async function notify(
  kind: string,
  title: string,
  body: string,
  severity: "info" | "warning" | "critical" = "info",
  data?: Record<string, unknown>,
): Promise<void> {
  await db.insert(notifications).values({ kind, title, body, severity, data: data ?? null });
}

export async function checkAlerts(): Promise<void> {
  // Bitcoin move
  try {
    const btc = await getSnapshot("BTC-USD").catch(() => null);
    if (btc && Math.abs(btc.changePct) >= 5 && (await shouldNotify("btc_move"))) {
      await notify(
        "btc_move",
        `Bitcoin ${btc.changePct >= 0 ? "surged" : "dropped"} ${btc.changePct.toFixed(1)}%`,
        `BTC is at $${btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${btc.source} data).`,
        Math.abs(btc.changePct) >= 10 ? "critical" : "warning",
        { symbol: "BTC-USD", changePct: btc.changePct },
      );
    }
    // Volume spike on BTC
    if (btc) {
      const bars = btc.bars;
      const last = bars[bars.length - 1];
      const avg = bars.slice(-21, -1).reduce((s, b) => s + b.volume, 0) / 20;
      if (avg > 0 && last.volume > avg * 2.5 && (await shouldNotify("volume_spike"))) {
        await notify(
          "volume_spike",
          "Unusual BTC volume",
          `Last candle volume is ${(last.volume / avg).toFixed(1)}× the 20-bar average.`,
          "info",
          { symbol: "BTC-USD" },
        );
      }
    }
    // Sentiment extremes
    const sentiment = await getSymbolSentiment("BTC-USD").catch(() => 0);
    if (Math.abs(sentiment) >= 0.5 && (await shouldNotify("sentiment"))) {
      await notify(
        "sentiment",
        `BTC news sentiment is ${sentiment > 0 ? "strongly bullish" : "strongly bearish"}`,
        `24h headline sentiment score: ${sentiment.toFixed(2)}.`,
        "info",
        { symbol: "BTC-USD", sentiment },
      );
    }
  } catch {
    /* alerts are best-effort */
  }

  // Risk warnings
  try {
    const cfg = await getConfig();
    const portfolio = await getPortfolio(cfg.mode);
    const pos = await loadPositions(portfolio.id);
    const cash = await loadCash(portfolio.id);
    const snaps = await Promise.all(pos.map((p) => getSnapshot(p.symbol).catch(() => null)));
    const priceOf = new Map<string, number>();
    snaps.forEach((s, i) => { if (s) priceOf.set(pos[i].symbol, s.price); });
    const { equity } = markPortfolio(cash, pos, (s) => priceOf.get(s));
    const baseline = portfolio.startingCash > 0 ? portfolio.startingCash : equity;
    const totalPct = baseline > 0 ? ((equity - baseline) / baseline) * 100 : 0;
    if (totalPct <= -cfg.dailyLossLimitPct && (await shouldNotify("risk"))) {
      await notify(
        "risk",
        "Account is down from starting capital",
        `Equity $${equity.toFixed(2)} is ${totalPct.toFixed(1)}% vs starting capital. Review risk settings.`,
        "warning",
      );
    }
    if (cfg.killSwitch && (await shouldNotify("risk"))) {
      await notify("risk", "Kill switch is ON", "New buys are blocked. Exits still work.", "critical");
    }
  } catch {
    /* best-effort */
  }

  // Agent failures
  try {
    const failed = await db.select().from(agents).where(eq(agents.status, "error"));
    if (failed.length > 0 && (await shouldNotify("agent_error"))) {
      await notify(
        "agent_error",
        `${failed.length} agent(s) in error state`,
        failed.map((a) => `${a.name}: ${a.lastError ?? "unknown"}`).join("; "),
        "warning",
      );
    }
  } catch {
    /* best-effort */
  }

  // Pending proposals
  try {
    const pending = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.status, "pending"));
    if (pending.length > 0 && (await shouldNotify("proposal"))) {
      await notify(
        "proposal",
        `${pending.length} improvement proposal(s) awaiting your approval`,
        "The Self-Improvement Agent has suggestions. Review them in the AI Agent tab.",
        "info",
      );
    }
  } catch {
    /* best-effort */
  }

  // Due reminders
  try {
    const due = await db.select().from(reminders).where(eq(reminders.done, false));
    const now = Date.now();
    for (const r of due) {
      if (r.dueAt.getTime() <= now && (await shouldNotify("reminder"))) {
        await notify("reminder", `Reminder: ${r.title}`, "This reminder is due.", "info", { reminderId: r.id });
      }
    }
  } catch {
    /* best-effort */
  }
}

export async function getNotifications(limit = 80) {
  return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function markNotificationRead(id: number): Promise<void> {
  await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(): Promise<void> {
  await db.update(notifications).set({ read: true });
}
