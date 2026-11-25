"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, api, clock, inputClass } from "./ui";
import { AGENTS, getAgentDef } from "@/lib/agents/registry";

type AgentRow = {
  key: string;
  name: string;
  role: string;
  status: string;
  currentTask: string | null;
  errorCount: number;
  tasksCompleted: number;
  performanceScore: number;
  lastError: string | null;
  lastUpdate: string;
};

type AgentMessage = {
  id: number;
  fromAgent: string;
  toAgent: string | null;
  channel: string;
  message: string;
  createdAt: string;
};

type ChatMsg = { id: number; role: string; body: string; createdAt: string };
type Proposal = { id: number; title: string; description: string; status: string; createdAt: string };

const STATUS_COLOR: Record<string, "green" | "slate" | "red" | "amber"> = {
  active: "green",
  idle: "slate",
  error: "red",
  paused: "amber",
};

const CHANNEL_COLOR: Record<string, "sky" | "violet" | "green" | "red"> = {
  coordination: "sky",
  report: "violet",
  chat: "green",
  alert: "red",
};

export default function AgentsPanel() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ messages: AgentMessage[]; chat: ChatMsg[] } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        api<{ agents: AgentRow[]; messages: AgentMessage[] }>("/api/agents"),
        api<{ proposals: Proposal[] }>("/api/proposals"),
      ]);
      setAgents(a.agents);
      setMessages(a.messages);
      setProposals(p.proposals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    }
  }, []);

  const loadDetail = useCallback(async (key: string) => {
    try {
      const d = await api<{ messages: AgentMessage[]; chat: ChatMsg[] }>(`/api/agents?agent=${key}`);
      setDetail(d);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (selected) {
      loadDetail(selected);
      const t = setInterval(() => loadDetail(selected), 10_000);
      return () => clearInterval(t);
    }
  }, [selected, loadDetail]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0 });
  }, [messages]);

  async function runAction(action: string, label: string) {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/agents", { action });
      setNotice(label);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    if (!selected || !chatInput.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ reply: string }>("/api/agents", { action: "message", agent: selected, text: chatInput });
      setChatInput("");
      await loadDetail(selected);
      await load();
      void res;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Message failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignTask() {
    if (!taskInput.trim()) return;
    setBusy(true);
    try {
      await api("/api/agents", { action: "task", task: taskInput });
      setTaskInput("");
      setNotice("Task assigned to the Chief Intelligence Agent.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Task failed");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: number, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await api("/api/proposals", { action: "decide", id, decision });
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  const activeCount = agents.filter((a) => a.status === "active").length;
  const pendingProposals = proposals.filter((p) => p.status === "pending");

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Agent control center</h2>
            <p className="text-xs text-slate-500">
              {activeCount} of {agents.length} agents active · click any agent to open its live chat · the Chief coordinates all of them
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => runAction("runResearch", "Research cycle complete. Reports are in the live feed.")}>
              Run research cycle
            </Button>
            <Button disabled={busy} onClick={() => runAction("runSelfImprovement", "Self-improvement review complete.")}>
              Self-improvement review
            </Button>
            <Button disabled={busy} onClick={() => runAction("runStrategyDev", "Strategy grid search complete.")}>
              Strategy grid search
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Assign a task to the Chief (e.g. 'Research Ethereum and report back')"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && assignTask()}
          />
          <Button disabled={busy || !taskInput.trim()} onClick={assignTask}>
            Assign
          </Button>
        </div>
        {notice && <div className="mt-2 text-xs text-slate-300">{notice}</div>}
        {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}
      </Card>

      {pendingProposals.length > 0 && (
        <Card title={`Improvement proposals awaiting your approval (${pendingProposals.length})`}>
          <div className="space-y-3">
            {pendingProposals.map((p) => (
              <div key={p.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-amber-200">{p.title}</span>
                  <div className="flex gap-2">
                    <Button variant="primary" disabled={busy} onClick={() => decide(p.id, "approved")}>
                      Approve
                    </Button>
                    <Button variant="danger" disabled={busy} onClick={() => decide(p.id, "rejected")}>
                      Reject
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{p.description}</p>
                <div className="mt-1 text-[11px] text-slate-500">{clock(p.createdAt)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <button
                key={a.key}
                onClick={() => setSelected(selected === a.key ? null : a.key)}
                className={`rounded-2xl border p-3 text-left transition ${
                  selected === a.key ? "border-emerald-500/50 bg-slate-800/80" : "border-slate-800 bg-slate-900/70 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-100">{a.name.replace(" Agent", "")}</span>
                  <Badge color={STATUS_COLOR[a.status] ?? "slate"}>{a.status}</Badge>
                </div>
                <div className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-snug text-slate-500">
                  {a.currentTask ?? a.role}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Score {a.performanceScore.toFixed(0)}/100</span>
                  <span>{a.tasksCompleted} tasks</span>
                  <span>{a.errorCount} errors</span>
                </div>
                {a.lastError && <div className="mt-1 truncate text-[11px] text-rose-400">{a.lastError}</div>}
              </button>
            ))}
          </div>

          {selected && (
            <Card title={`${getAgentDef(selected)?.name ?? selected} — live chat`}>
              <div className="mb-3 max-h-72 space-y-2 overflow-auto pr-1">
                {detail?.chat.length === 0 && <div className="text-xs text-slate-500">No chat yet. Say hello — this agent answers from its live data.</div>}
                {detail?.chat.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${m.role === "user" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-200"}`}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder={`Message the ${getAgentDef(selected)?.name ?? selected}…`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                />
                <Button variant="primary" disabled={busy || !chatInput.trim()} onClick={sendChat}>
                  Send
                </Button>
              </div>
              {detail && detail.messages.length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-3">
                  <div className="mb-2 text-xs font-medium text-slate-400">Agent communications</div>
                  <div className="max-h-48 space-y-1.5 overflow-auto pr-1">
                    {detail.messages.slice(0, 20).map((m) => (
                      <div key={m.id} className="text-[11px] leading-snug text-slate-400">
                        <span className="text-slate-500">{clock(m.createdAt)}</span>{" "}
                        <span className="text-slate-300">{m.fromAgent}</span> → <span className="text-slate-300">{m.toAgent ?? "all"}</span>: {m.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <Card title="Live agent communication" right={<span className="text-[11px] text-slate-500">refreshes every 10s</span>}>
          <div ref={feedRef} className="max-h-[720px] space-y-2 overflow-auto pr-1">
            {messages.length === 0 && <div className="text-sm text-slate-500">No messages yet. Run a research cycle to watch the agents work.</div>}
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg bg-slate-950/60 p-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge color={CHANNEL_COLOR[m.channel] ?? "slate"}>{m.channel}</Badge>
                  <span className="text-[11px] text-slate-300">
                    {m.fromAgent} → {m.toAgent ?? "all agents"}
                  </span>
                  <span className="ml-auto text-[10px] text-slate-500">{clock(m.createdAt)}</span>
                </div>
                <div className="text-xs leading-relaxed text-slate-300">{m.message}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
