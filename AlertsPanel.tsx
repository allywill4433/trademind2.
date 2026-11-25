"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, api, clock, inputClass } from "./ui";

type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  severity: string;
  read: boolean;
  createdAt: string;
};

type Reminder = { id: number; title: string; dueAt: string; done: boolean };

const SEVERITY_COLOR: Record<string, "sky" | "amber" | "red"> = {
  info: "sky",
  warning: "amber",
  critical: "red",
};

export default function AlertsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [n, r] = await Promise.all([
        api<{ notifications: Notification[]; unread: number }>("/api/notifications"),
        api<{ reminders: Reminder[] }>("/api/reminders"),
      ]);
      setNotifications(n.notifications);
      setUnread(n.unread);
      setReminders(r.reminders);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(id: number) {
    await api("/api/notifications", { action: "read", id }).catch(() => undefined);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAll() {
    await api("/api/notifications", { action: "readAll" }).catch(() => undefined);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  async function addReminder() {
    if (!title.trim() || !dueAt) return;
    setBusy(true);
    try {
      await api("/api/reminders", { action: "add", title, dueAt: new Date(dueAt).toISOString() });
      setTitle("");
      setDueAt("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function reminderAction(action: "done" | "delete", id: number) {
    await api("/api/reminders", { action, id }).catch(() => undefined);
    await load();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card
        title={`Notifications ${unread > 0 ? `(${unread} unread)` : ""}`}
        right={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => api("/api/notifications", { action: "check" }).then(load)}>
              Check now
            </Button>
            <Button variant="ghost" disabled={unread === 0} onClick={markAll}>
              Mark all read
            </Button>
          </div>
        }
      >
        {error && <div className="mb-2 text-xs text-rose-400">{error}</div>}
        <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
          {notifications.length === 0 && (
            <div className="text-sm text-slate-500">
              No alerts yet. The system watches for Bitcoin moves, volume spikes, sentiment shifts, risk warnings,
              agent failures, pending proposals and due reminders.
            </div>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                n.read ? "border-slate-800 bg-slate-950/40 opacity-60" : "border-slate-700 bg-slate-900/70 hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <Badge color={SEVERITY_COLOR[n.severity] ?? "sky"}>{n.severity}</Badge>
                <span className="text-xs font-medium text-slate-100">{n.title}</span>
                <span className="ml-auto text-[10px] text-slate-500">{clock(n.createdAt)}</span>
              </div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">{n.body}</div>
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Reminders">
          <div className="space-y-2">
            <input className={inputClass} placeholder="Reminder title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className={inputClass} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <Button variant="primary" className="w-full" disabled={busy || !title.trim() || !dueAt} onClick={addReminder}>
              Add reminder
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {reminders.length === 0 && <div className="text-xs text-slate-500">No reminders. The assistant will alert you when they are due.</div>}
            {reminders.map((r) => (
              <div key={r.id} className={`flex items-center justify-between gap-2 rounded-lg bg-slate-950/60 p-2 ${r.done ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <div className={`truncate text-xs text-slate-200 ${r.done ? "line-through" : ""}`}>{r.title}</div>
                  <div className="text-[10px] text-slate-500">{clock(r.dueAt)}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!r.done && (
                    <Button variant="ghost" onClick={() => reminderAction("done", r.id)}>
                      Done
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => reminderAction("delete", r.id)}>
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Alert rules">
          <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>• Bitcoin moves ≥ 5% (critical at ≥ 10%)</li>
            <li>• BTC volume spikes above 2.5× average</li>
            <li>• Extreme news sentiment shifts</li>
            <li>• Account drawdown and kill-switch warnings</li>
            <li>• Agent failures and pending proposals</li>
            <li>• Due reminders</li>
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            Alerts appear here and in your browser (if you allow notifications). Mobile push requires VAPID keys —
            the PWA is installable on your home screen regardless.
          </p>
        </Card>
      </div>
    </div>
  );
}
