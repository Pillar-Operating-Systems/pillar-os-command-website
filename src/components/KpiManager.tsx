import { useEffect, useState, useCallback } from "react";
import { Target, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

interface Kpi {
  id: string;
  name: string;
  metric_action: string | null;
  period: string;
  target: number;
  assigned_to: string | null;
  created_at: string;
}
interface Profile { id: string; username: string | null; email: string }

const ACTIONS = [
  { value: "called", label: "Calls" },
  { value: "follow_up", label: "Follow Ups" },
  { value: "pipeline", label: "Leads to Pipeline" },
  { value: "archived", label: "Archived" },
];
const PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function KpiManager() {
  const { userId } = useAuth();
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [actions, setActions] = useState<{ user_id: string; action_type: string; recorded_at: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("called");
  const [period, setPeriod] = useState("weekly");
  const [target, setTarget] = useState(10);
  const [assignedTo, setAssignedTo] = useState<string>("");

  const load = useCallback(async () => {
    const [k, p, a] = await Promise.all([
      supabase.from("kpis").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, username, email").order("created_at"),
      supabase.from("analytics").select("user_id, action_type, recorded_at"),
    ]);
    setKpis((k.data ?? []) as Kpi[]);
    setProfiles((p.data ?? []) as Profile[]);
    setActions((a.data ?? []) as { user_id: string; action_type: string; recorded_at: string }[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("kpis").insert({
      name: name.trim(), metric_action: metric, period, target,
      assigned_to: assignedTo || null, created_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("KPI created");
    setName(""); setTarget(10); setAssignedTo(""); setAdding(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("kpis").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const progress = (k: Kpi) => {
    const now = new Date();
    let since: number;
    if (k.period === "daily") since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    else if (k.period === "monthly") since = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    else since = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const matches = actions.filter((a) => {
      if (a.action_type !== k.metric_action) return false;
      if (new Date(a.recorded_at).getTime() < since) return false;
      if (k.assigned_to && a.user_id !== k.assigned_to) return false;
      return true;
    });
    return matches.length;
  };

  const nameFor = (id: string | null) =>
    !id ? "Team-wide" : (profiles.find((p) => p.id === id)?.username || profiles.find((p) => p.id === id)?.email || "—");

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">KPIs</h2>
        <button onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#2563eb] text-white text-xs hover:bg-[#1d4ed8]">
          <Plus className="h-3 w-3" /> {adding ? "Cancel" : "New KPI"}
        </button>
      </div>

      {adding && (
        <form onSubmit={add} className="mb-4 p-3 rounded-md border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="KPI name" required
            className="sm:col-span-2 px-3 py-2 border border-slate-300 rounded-md bg-white" />
          <select value={metric} onChange={(e) => setMetric(e.target.value)}
            className="px-2 py-2 border border-slate-300 rounded-md bg-white">
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-2 py-2 border border-slate-300 rounded-md bg-white">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} required
            className="px-3 py-2 border border-slate-300 rounded-md bg-white" />
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
            className="px-2 py-2 border border-slate-300 rounded-md bg-white">
            <option value="">Team-wide</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.username || p.email}</option>)}
          </select>
          <div className="sm:col-span-6 flex justify-end">
            <button type="submit" className="px-3 py-1.5 rounded bg-[#2563eb] text-white text-xs hover:bg-[#1d4ed8]">Create KPI</button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">KPI</th>
              <th className="px-4 py-3">Metric</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {kpis.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No KPIs yet.</td></tr>}
            {kpis.map((k) => {
              const current = progress(k);
              const pct = Math.min(100, Math.round((current / Math.max(1, k.target)) * 100));
              return (
                <tr key={k.id}>
                  <td className="px-4 py-3 font-medium text-[#0f172a]">{k.name}</td>
                  <td className="px-4 py-3 text-slate-600">{ACTIONS.find((a) => a.value === k.metric_action)?.label ?? k.metric_action}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{k.period}</td>
                  <td className="px-4 py-3 text-slate-600">{nameFor(k.assigned_to)}</td>
                  <td className="px-4 py-3 w-64">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-[#2563eb]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-600">{current}/{k.target}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(k.id)} className="p-1 rounded hover:bg-slate-100" title="Delete">
                      <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
        <Target className="h-3 w-3" /> Progress is computed live from logged actions.
      </div>
    </section>
  );
}
