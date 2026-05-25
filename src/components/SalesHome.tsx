import { useEffect, useMemo, useState, useCallback } from "react";
import { Phone, TrendingUp, Trophy, Target, Calendar as CalIcon, Megaphone, Pin, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboard } from "@/lib/staff.functions";

interface ActionRow {
  user_id: string;
  action_type: string;
  recorded_at: string;
}
interface DealRow {
  id: string;
  business_name: string;
  deal_value: number | null;
  next_action: string | null;
  next_action_date: string | null;
  stages: Record<string, string> | null;
  assigned_to: string | null;
}
interface LeadRow {
  id: string;
  business_name: string;
  phone: string | null;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  status: string;
  assigned_to: string | null;
}
interface NoticeRow {
  id: string;
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
}
interface KpiRow {
  id: string;
  name: string;
  target: number;
  period: string;
  metric_action: string | null;
  assigned_to: string | null;
}
interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  task_type: string;
  status: string;
  assigned_to: string | null;
  description: string | null;
}

const ACTION_XP: Record<string, number> = { called: 2, archived: 5, follow_up: 10, pipeline: 50 };
const LEVELS: { xp: number; label: string }[] = [
  { xp: 0, label: "Rookie" },
  { xp: 250, label: "Caller" },
  { xp: 600, label: "Closer" },
  { xp: 1000, label: "Sales Hunter" },
  { xp: 1500, label: "Top Performer" },
  { xp: 2500, label: "Legend" },
];
function levelInfo(xp: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) idx = i;
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  return { level: idx + 1, label: current.label, currentXp: current.xp, nextXp: next?.xp ?? null };
}

const PERIOD_MS: Record<string, number> = {
  daily: 1 * 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

export function SalesHome() {
  const { userId, email, displayName } = useAuth();
  const username = displayName ?? email?.split("@")[0] ?? "";

  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [myActions, setMyActions] = useState<ActionRow[]>([]);
  const [board, setBoard] = useState<{ id: string; xp: number }[]>([]);
  const [myDeals, setMyDeals] = useState<DealRow[]>([]);
  const [followUps, setFollowUps] = useState<LeadRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);

  const fetchBoard = useServerFn(getLeaderboard);

  const load = useCallback(async () => {
    if (!userId) return;
    const today = todayISO();
    const [noticesRes, mineRes, boardRes, dealsRes, fuRes, kpiRes, tasksRes] = await Promise.all([
      supabase.from("notices").select("id,title,body,priority,pinned").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("analytics").select("user_id, action_type, recorded_at").eq("user_id", userId),
      fetchBoard().catch(() => ({ board: [] as { id: string; xp: number }[] })),
      supabase.from("pipeline_deals").select("id, business_name, deal_value, next_action, next_action_date, stages, assigned_to").eq("assigned_to", userId),
      supabase.from("leads").select("id, business_name, phone, follow_up_date, follow_up_notes, status, assigned_to").eq("status", "follow_up"),
      supabase.from("kpis").select("id, name, target, period, metric_action, assigned_to"),
      supabase.from("tasks").select("id, title, due_date, task_type, status, assigned_to, description").eq("due_date", today),
    ]);
    setNotices((noticesRes.data ?? []) as NoticeRow[]);
    setMyActions((mineRes.data ?? []) as ActionRow[]);
    setBoard(boardRes.board);
    setMyDeals((dealsRes.data ?? []) as DealRow[]);
    // filter follow-ups to me & today
    const mineFu = ((fuRes.data ?? []) as LeadRow[]).filter((l) => {
      if (!l.follow_up_date) return false;
      const d = new Date(l.follow_up_date);
      const sameDay = d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth() && d.getDate() === new Date().getDate();
      const mine = l.assigned_to === username || l.assigned_to === userId;
      return sameDay && mine;
    });
    setFollowUps(mineFu);
    const myKpis = ((kpiRes.data ?? []) as (KpiRow & { assigned_to: string | null })[]).filter(
      (k) => !k.assigned_to || k.assigned_to === "all" || k.assigned_to === userId || k.assigned_to === username,
    );
    setKpis(myKpis);
    const myTasks = ((tasksRes.data ?? []) as TaskRow[]).filter((t) => t.assigned_to === userId);
    setTasks(myTasks);
  }, [userId, username, fetchBoard]);

  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();

  const myXp = useMemo(() => myActions.reduce((s, a) => s + (ACTION_XP[a.action_type] ?? 0), 0), [myActions]);
  const lvl = useMemo(() => levelInfo(myXp), [myXp]);
  const xpProgressPct = useMemo(() => {
    if (lvl.nextXp == null) return 100;
    const span = lvl.nextXp - lvl.currentXp;
    const into = myXp - lvl.currentXp;
    return Math.max(0, Math.min(100, Math.round((into / span) * 100)));
  }, [lvl, myXp]);

  const callsToday = useMemo(
    () => myActions.filter((a) => new Date(a.recorded_at).getTime() >= todayStart).length,
    [myActions, todayStart],
  );

  const pipelineValue = useMemo(
    () => myDeals.reduce((s, d) => s + Number(d.deal_value ?? 0), 0),
    [myDeals],
  );

  const sortedBoard = useMemo(() => [...board].sort((a, b) => b.xp - a.xp), [board]);
  const myRank = useMemo(() => {
    const idx = sortedBoard.findIndex((r) => r.id === userId);
    return { rank: idx >= 0 ? idx + 1 : sortedBoard.length + 1, total: sortedBoard.length || 1 };
  }, [sortedBoard, userId]);

  const today = todayISO();
  const pipelineToday = useMemo(
    () => myDeals.filter((d) => d.next_action_date === today),
    [myDeals, today],
  );

  // KPI progress: compute current count from analytics by metric_action within period
  const kpiWithProgress = useMemo(() => {
    return kpis.map((k) => {
      const periodMs = PERIOD_MS[k.period] ?? PERIOD_MS.weekly;
      const since = now - periodMs;
      const current = myActions.filter(
        (a) => a.action_type === (k.metric_action ?? "called") && new Date(a.recorded_at).getTime() >= since,
      ).length;
      const pct = k.target > 0 ? Math.min(100, Math.round((current / k.target) * 100)) : 0;
      let state: "track" | "risk" | "behind" = "track";
      if (pct < 40) state = "behind";
      else if (pct < 75) state = "risk";
      return { ...k, current, pct, state };
    });
  }, [kpis, myActions, now]);

  const meName = displayName || email?.split("@")[0] || "You";

  const activeNotices = notices;
  const urgent = activeNotices.filter((n) => n.priority === "urgent");
  const important = activeNotices.filter((n) => n.priority === "high");
  const normal = activeNotices.filter((n) => n.priority === "normal");

  const completeTask = async (id: string) => {
    const { error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", id);
    if (!error) {
      setSelectedTask(null);
      load();
    }
  };

  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#0f172a]">Welcome back, {meName}</h1>
        <p className="mt-1 text-sm text-slate-500">Your sales command centre.</p>
      </div>

      {/* Notice Board */}
      {activeNotices.length > 0 && (
        <div className="space-y-2">
          {urgent.map((n) => (
            <div key={n.id} className="w-full rounded-md bg-red-600 text-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                <span className="font-semibold text-sm">{n.title}</span>
                {n.pinned && <Pin className="h-3 w-3" />}
              </div>
              {n.body && <p className="mt-1 text-xs opacity-95 whitespace-pre-wrap">{n.body}</p>}
            </div>
          ))}
          {important.map((n) => (
            <div key={n.id} className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2 text-amber-900">
                <Megaphone className="h-4 w-4" />
                <span className="font-semibold text-sm">{n.title}</span>
                {n.pinned && <Pin className="h-3 w-3" />}
              </div>
              {n.body && <p className="mt-1 text-xs text-amber-900/80 whitespace-pre-wrap">{n.body}</p>}
            </div>
          ))}
          {normal.map((n) => (
            <div key={n.id} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-[#0f172a]">
                <Megaphone className="h-4 w-4 text-slate-500" />
                <span className="font-semibold text-sm">{n.title}</span>
                {n.pinned && <Pin className="h-3 w-3 text-[#2563eb]" />}
              </div>
              {n.body && <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{n.body}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Row 1 — Personal Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="My XP" value={`${myXp.toLocaleString()}`} sub={`Level ${lvl.level} — ${lvl.label}`} icon={Trophy} />
        <Stat label="My Rank" value={`#${myRank.rank}`} sub={`of ${myRank.total}`} icon={Target} />
        <Stat label="Calls Today" value={callsToday.toString()} icon={Phone} />
        <Stat label="Pipeline Value" value={`$${pipelineValue.toLocaleString()}`} icon={TrendingUp} />
      </div>

      {/* Row 2 — XP progress */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{myXp.toLocaleString()} XP</span>
          <span>{lvl.nextXp != null ? `${lvl.nextXp.toLocaleString()} XP` : "Max level"}</span>
        </div>
        <div className="mt-2 h-3 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-[#2563EB] transition-all" style={{ width: `${xpProgressPct}%` }} />
        </div>
        <div className="mt-2 text-xs text-slate-600">
          {lvl.nextXp != null ? `${(lvl.nextXp - myXp).toLocaleString()} XP to reach Level ${lvl.level + 1}` : "Top level reached"}
        </div>
      </div>

      {/* Row 3 — Today's Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-6">
        {/* Due Today */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-[#0f172a] mb-3">Follow-ups Due Today</h2>
            {followUps.length === 0 ? (
              <p className="text-sm text-slate-500">No follow-ups due today.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {followUps.map((f) => {
                  const overdue = f.follow_up_date ? new Date(f.follow_up_date).getTime() < now - 60 * 60 * 1000 : false;
                  return (
                    <li key={f.id} className="py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[#0f172a] truncate">{f.business_name}</span>
                          {overdue && <span className="text-[10px] uppercase bg-red-600 text-white px-1.5 py-0.5 rounded">Overdue</span>}
                        </div>
                        {f.phone && (
                          <a href={`tel:${f.phone}`} className="text-xs text-[#2563eb] hover:underline">{f.phone}</a>
                        )}
                        {f.follow_up_notes && <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">{f.follow_up_notes}</div>}
                      </div>
                      <Link to="/leads" className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#2563EB] text-white text-xs hover:bg-[#1d4ed8]">
                        <Phone className="h-3 w-3" /> Call Now
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-[#0f172a] mb-3">Pipeline Actions Due Today</h2>
            {pipelineToday.length === 0 ? (
              <p className="text-sm text-slate-500">No pipeline actions due today.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pipelineToday.map((d) => {
                  const phase = Object.keys(d.stages ?? {}).slice(-1)[0] ?? "—";
                  return (
                    <li key={d.id} className="py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[#0f172a] truncate">{d.business_name}</div>
                        <div className="text-xs text-slate-500">Phase: {phase.replace(/_/g, " ")}</div>
                        {d.next_action && <div className="mt-0.5 text-xs text-slate-600 line-clamp-2">{d.next_action}</div>}
                      </div>
                      <Link to="/pipeline" className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#2563EB] text-[#2563EB] text-xs hover:bg-[#2563EB]/10">
                        View Deal <ArrowRight className="h-3 w-3" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[#0f172a] mb-3">My KPIs</h2>
          {kpiWithProgress.length === 0 ? (
            <p className="text-sm text-slate-500">No KPIs set.</p>
          ) : (
            <ul className="space-y-4">
              {kpiWithProgress.map((k) => {
                const tone =
                  k.state === "track" ? { bar: "bg-[#2563EB]", badge: "bg-[#2563EB] text-white", label: "On track" }
                  : k.state === "risk" ? { bar: "bg-amber-500", badge: "bg-amber-500 text-white", label: "At risk" }
                  : { bar: "bg-red-600", badge: "bg-red-600 text-white", label: "Behind" };
                return (
                  <li key={k.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#0f172a] truncate">{k.name}</span>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${tone.badge}`}>{tone.label}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${k.pct}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-slate-500">
                      <span>{k.current} / {k.target}</span>
                      <span className="capitalize">{k.period}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Row 4 — Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/sales-grind" className="text-center px-6 py-5 rounded-lg bg-[#2563EB] text-white font-semibold hover:bg-[#1d4ed8] shadow-sm">
          Open Sales Grind
        </Link>
        <Link to="/leads" className="text-center px-6 py-5 rounded-lg border-2 border-[#2563EB] text-[#2563EB] font-semibold hover:bg-[#2563EB]/10">
          View Leads Dashboard
        </Link>
        <Link to="/pipeline" className="text-center px-6 py-5 rounded-lg border-2 border-[#2563EB] text-[#2563EB] font-semibold hover:bg-[#2563EB]/10">
          View My Pipeline
        </Link>
      </div>

      {/* Row 5 — Today's Calendar */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalIcon className="h-4 w-4 text-[#2563eb]" />
          <h2 className="text-sm font-semibold text-[#0f172a]">Today's Calendar</h2>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing scheduled today.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <li key={t.id}>
                <button onClick={() => setSelectedTask(t)} className="w-full py-2 flex items-center gap-3 text-left hover:bg-slate-50 rounded px-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB] shrink-0" />
                  <span className="flex-1 text-sm text-[#0f172a] truncate">{t.title}</span>
                  <span className="text-xs text-slate-500 capitalize">{t.task_type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Task modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedTask(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-[#0f172a]">{selectedTask.title}</h3>
              <button onClick={() => setSelectedTask(null)} className="p-1 rounded hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k="Date" v={selectedTask.due_date ?? "—"} />
              <Row k="Type" v={selectedTask.task_type} />
              <Row k="Status" v={selectedTask.status} />
              {selectedTask.description && <Row k="Notes" v={selectedTask.description} />}
            </dl>
            <div className="mt-4 flex items-center gap-2 justify-end">
              <Link to="/calendar" className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50">Open Calendar</Link>
              {selectedTask.status !== "completed" && (
                <button onClick={() => completeTask(selectedTask.id)} className="text-xs px-3 py-1.5 rounded bg-[#2563EB] text-white hover:bg-[#1d4ed8]">
                  Mark complete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-xs uppercase tracking-wider text-slate-500 w-20 shrink-0">{k}</dt>
      <dd className="text-sm text-[#0f172a]">{v}</dd>
    </div>
  );
}

function Stat({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Phone }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-[#2563eb]" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-[#0f172a]">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
