import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Key/value store for user configuration and agent runtime state.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// "paper" = simulated fills with fake money, "live" = mirrored to a real broker,
// "experiment" = the dedicated $10 -> $1,000 research portfolio.
export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("paper"),
  startingCash: doublePrecision("starting_cash").notNull(),
  cash: doublePrecision("cash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolio_id").notNull(),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(),
    qty: doublePrecision("qty").notNull(),
    avgPrice: doublePrecision("avg_price").notNull(),
    stopPrice: doublePrecision("stop_price"),
    targetPrice: doublePrecision("target_price"),
    strategy: text("strategy"),
    regime: text("regime"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("positions_portfolio_symbol_idx").on(t.portfolioId, t.symbol)],
);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").notNull(),
  symbol: text("symbol").notNull(),
  assetClass: text("asset_class").notNull(),
  side: text("side").notNull(),
  qty: doublePrecision("qty").notNull(),
  price: doublePrecision("price").notNull(),
  notional: doublePrecision("notional").notNull(),
  fee: doublePrecision("fee").notNull().default(0),
  status: text("status").notNull().default("filled"),
  source: text("source").notNull().default("manual"), // agent | manual | broker
  strategy: text("strategy"),
  regime: text("regime"),
  reason: text("reason"),
  realizedPnl: doublePrecision("realized_pnl"),
  realizedPnlPct: doublePrecision("realized_pnl_pct"),
  brokerOrderId: text("broker_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Limit orders that are waiting for the price to reach them (paper mode).
export const pendingOrders = pgTable("pending_orders", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").notNull(),
  symbol: text("symbol").notNull(),
  assetClass: text("asset_class").notNull(),
  side: text("side").notNull(),
  qty: doublePrecision("qty"),
  notional: doublePrecision("notional"),
  limitPrice: doublePrecision("limit_price").notNull(),
  status: text("status").notNull().default("open"), // open | filled | cancelled
  brokerOrderId: text("broker_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const equitySnapshots = pgTable("equity_snapshots", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").notNull(),
  equity: doublePrecision("equity").notNull(),
  cash: doublePrecision("cash").notNull(),
  positionsValue: doublePrecision("positions_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// The AI's memory: outcomes per (strategy, asset class, market regime).
export const strategyStats = pgTable(
  "strategy_stats",
  {
    strategy: text("strategy").notNull(),
    assetClass: text("asset_class").notNull(),
    regime: text("regime").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    sumWinPct: doublePrecision("sum_win_pct").notNull().default(0),
    sumLossPct: doublePrecision("sum_loss_pct").notNull().default(0),
    trades: integer("trades").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.strategy, t.assetClass, t.regime] })],
);

export const agentEvents = pgTable("agent_events", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // trade | learn | block | info | error
  message: text("message").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  symbol: text("symbol"),
  stance: text("stance"), // bullish | bearish | neutral
  source: text("source").notNull().default("user"), // user | agent
  likes: integer("likes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Multi-agent intelligence layer
// ---------------------------------------------------------------------------

// One row per specialized agent: live status, current task, performance.
export const agents = pgTable("agents", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("idle"), // active | idle | error | paused
  currentTask: text("current_task"),
  errorCount: integer("error_count").notNull().default(0),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  performanceScore: doublePrecision("performance_score").notNull().default(50),
  lastError: text("last_error"),
  lastUpdate: timestamp("last_update", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Agent-to-agent communication and the live chat feed.
export const agentMessages = pgTable("agent_messages", {
  id: serial("id").primaryKey(),
  fromAgent: text("from_agent").notNull(),
  toAgent: text("to_agent"), // null = broadcast to all agents
  channel: text("channel").notNull().default("coordination"), // coordination | report | chat | alert
  message: text("message").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Structured reasoning records for important recommendations.
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  asset: text("asset"),
  recommendation: text("recommendation").notNull(), // buy | sell | hold | no-trade | research
  confidence: doublePrecision("confidence").notNull().default(0),
  reasoning: jsonb("reasoning"),
  verification: jsonb("verification"),
  status: text("status").notNull().default("open"), // open | acted | superseded
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Searchable knowledge database: news, YouTube research, trader studies, etc.
export const knowledgeItems = pgTable("knowledge_items", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // news | youtube | trader | social | research | calendar
  title: text("title").notNull(),
  url: text("url"),
  summary: text("summary"),
  tags: jsonb("tags"),
  sentiment: doublePrecision("sentiment").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Strategy registry: every strategy ever tested, including failures.
export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  entryRules: text("entry_rules"),
  exitRules: text("exit_rules"),
  riskParams: jsonb("risk_params"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("testing"), // testing | paper | approved | rejected | retired
  stats: jsonb("stats"),
  weaknesses: text("weaknesses"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Permanent record of every experiment (never deleted).
export const experiments = pgTable("experiments", {
  id: serial("id").primaryKey(),
  strategyKey: text("strategy_key").notNull(),
  type: text("type").notNull(), // backtest | walkforward | montecarlo | stress | outofsample | grid | paper
  params: jsonb("params"),
  results: jsonb("results"),
  verdict: text("verdict"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// User-facing alerts and notifications.
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  severity: text("severity").notNull().default("info"), // info | warning | critical
  read: boolean("read").notNull().default(false),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Persistent chat history: the assistant and per-agent conversations.
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(), // "assistant" | "agent:<key>" | "system"
  role: text("role").notNull(), // user | assistant | agent
  body: text("body").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Security audit trail for sensitive actions.
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Model orchestration performance tracking.
export const modelPerformance = pgTable("model_performance", {
  id: serial("id").primaryKey(),
  model: text("model").notNull(),
  provider: text("provider").notNull(),
  task: text("task").notNull(),
  runs: integer("runs").notNull().default(0),
  successes: integer("successes").notNull().default(0),
  avgConfidence: doublePrecision("avg_confidence").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});

// Operational health of each subsystem (uptime statistics).
export const systemHealth = pgTable("system_health", {
  id: serial("id").primaryKey(),
  component: text("component").notNull(),
  status: text("status").notNull(), // ok | degraded | down
  latencyMs: doublePrecision("latency_ms"),
  error: text("error"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

// Daily financial tracking for the six-figure objective.
export const financialSnapshots = pgTable("financial_snapshots", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  equity: doublePrecision("equity").notNull(),
  realizedPnl: doublePrecision("realized_pnl").notNull().default(0),
  fees: doublePrecision("fees").notNull().default(0),
  taxEstimate: doublePrecision("tax_estimate").notNull().default(0),
  annualizedReturn: doublePrecision("annualized_return"),
  sharpe: doublePrecision("sharpe"),
  maxDrawdown: doublePrecision("max_drawdown"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// User reminders (calendar integration without OAuth).
export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Self-improvement proposals: the AI suggests, the user approves.
export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});
