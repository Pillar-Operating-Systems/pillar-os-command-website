import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Phone, TrendingUp, DollarSign, Trophy, Target } from "lucide-react";
import { getAllStaffMetrics, type StaffMetrics } from "@/lib/staff.functions";
import { KpiManager } from "@/components/KpiManager";
import { TeamAnalyticsTable } from "@/components/TeamAnalyticsTable";

export const Route = createFileRoute("/sales-team")({ component: Staff });

type Row = {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  role: "owner" | "sales" | null;
};

type AllowRow = {
  id: string;
  email: string;
  used: boolean;
  created_at: string;
};

function Staff() {
  const { userId } = useAuth();
  const fetchMetrics = useServerFn(getAllStaffMetrics);
  const [rows, setRows] = useState<Row[]>([]);
  const [metrics, setMetrics] = useState<Record<string, StaffMetrics>>({});
  const [allow, setAllow] = useState<AllowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profs }, { data: roles }, { data: allowed }, mres] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name, username").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("allowed_emails").select("id, email, used, created_at").order("created_at", { ascending: false }),
      fetchMetrics().catch(() => ({ staff: [] as StaffMetrics[] })),
    ]);
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as "owner" | "sales"]));
    setRows(
      (profs ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        display_name: p.display_name,
        username: (p as { username?: string | null }).username ?? null,
        role: roleMap.get(p.id) ?? null,
      })),
    );
    setAllow((allowed ?? []) as AllowRow[]);
    const mMap: Record<string, StaffMetrics> = {};
    for (const s of mres.staff) mMap[s.userId] = s;
    setMetrics(mMap);
    setLoading(false);
  }, [fetchMetrics]);

  useEffect(() => { load(); }, [load]);

  const setRole = async (uid: string, role: "owner" | "sales") => {
    const del = await supabase.from("user_roles").delete().eq("user_id", uid);
    if (del.error) return toast.error(del.error.message);
    const ins = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (ins.error) return toast.error(ins.error.message);
    toast.success(`Set ${role}`);
    load();
  };

  const authoriseEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = newEmail.trim().toLowerCase();
    if (!em) return;
    setAdding(true);
    const { error } = await supabase.from("allowed_emails").insert({ email: em, added_by: userId });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success(`Authorised ${em}`);
    setNewEmail("");
    load();
  };

  const removeAllow = async (id: string) => {
    const { error } = await supabase.from("allowed_emails").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  return (
    <AppShell requireRole="owner">
      <div className="p-6 lg:p-10 max-w-6xl">
        <h1 className="text-2xl font-semibold text-[#0f172a]">Staff</h1>
        <p className="mt-1 text-sm text-slate-500">Manage team members, performance metrics, and authorised sign-up emails.</p>

        {/* Authorised Emails */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Authorised Emails</h2>
          <form onSubmit={authoriseEmail} className="flex gap-2 max-w-xl mb-4">
            <input
              type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              placeholder="teammate@example.com" required
              className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
            />
            <button type="submit" disabled={adding}
              className="px-4 py-2 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4ed8] disabled:opacity-60">
              {adding ? "Adding…" : "Authorise Email"}
            </button>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date added</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && <tr><td colSpan={4} className="px-4 py-6 text-slate-500">Loading…</td></tr>}
                {!loading && allow.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-slate-500">No authorised emails yet.</td></tr>}
                {allow.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-slate-700">{a.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${a.used ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-700"}`}>
                        {a.used ? "Used" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeAllow(a.id)} disabled={a.used}
                        className="px-3 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Team members with expandable metrics */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Team Members</h2>
          <div className="space-y-3">
            {loading && <div className="text-sm text-slate-500">Loading…</div>}
            {!loading && rows.length === 0 && <div className="text-sm text-slate-500">No users yet.</div>}
            {rows.map((r) => {
              const isMe = r.id === userId;
              const m = metrics[r.id];
              const isOpen = expanded[r.id];
              return (
                <div key={r.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-[#0f172a] text-white flex items-center justify-center text-sm font-semibold">
                        {(r.username || r.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-[#0f172a]">
                          {r.username ?? r.display_name ?? "—"} {isMe && <span className="text-xs text-slate-400">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{r.email}</div>
                      </div>
                      <span className={`ml-2 inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.role === "owner" ? "bg-[#2563eb] text-white" :
                        r.role === "sales" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-700"
                      }`}>{r.role ?? "no role"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setRole(r.id, "sales")} disabled={isMe || r.role === "sales"}
                        className="px-3 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                        Make Sales
                      </button>
                      <button onClick={() => setRole(r.id, "owner")} disabled={isMe || r.role === "owner"}
                        className="px-3 py-1 rounded bg-[#2563eb] text-white text-xs hover:bg-[#1d4ed8] disabled:opacity-40 disabled:cursor-not-allowed">
                        Make Owner
                      </button>
                      <button onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50">
                        Metrics {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                      {!m ? (
                        <div className="text-sm text-slate-500">No metrics recorded yet.</div>
                      ) : (
                        <>
                          <MetricsGroup title="Activity">
                            <M label="Total calls" value={m.callsTotal.toString()} icon={Phone} />
                            <M label="Calls today" value={m.callsToday.toString()} icon={Phone} />
                            <M label="Calls this week" value={m.callsWeek.toString()} icon={Phone} />
                            <M label="Follow ups scheduled" value={m.followUpsTotal.toString()} icon={Target} />
                            <M label="Follow ups this week" value={m.followUpsThisWeek.toString()} icon={Target} />
                          </MetricsGroup>
                          <MetricsGroup title="Conversion">
                            <M label="Call → Pipeline" value={`${m.callToPipelinePct}%`} icon={Target} />
                            <M label="Pipeline → Close" value={`${m.pipelineToClosePct}%`} icon={Target} />
                            <M label="Leads to pipeline" value={m.leadsToPipeline.toString()} icon={TrendingUp} />
                          </MetricsGroup>
                          <MetricsGroup title="Revenue">
                            <M label="Pipeline value" value={`$${m.pipelineValue.toLocaleString()}`} icon={TrendingUp} />
                            <M label="MRR generated" value={`$${m.pipelineMrr.toLocaleString()}`} icon={DollarSign} />
                            <M label="One-time fees" value={`$${m.oneTimeFees.toLocaleString()}`} icon={DollarSign} />
                            <M label="Total revenue" value={`$${m.totalRevenue.toLocaleString()}`} icon={DollarSign} />
                          </MetricsGroup>
                          <MetricsGroup title="Leaderboard">
                            <M label="XP" value={m.xp.toLocaleString()} icon={Trophy} />
                            <M label="Level" value={`L${m.level}`} icon={Trophy} />
                            <M label="Rank" value={`#${m.rank}`} icon={Trophy} />
                            <M label="Active now" value={m.isActiveNow ? "Yes" : "No"} icon={Trophy} />
                          </MetricsGroup>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Team Analytics Table */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Team Analytics</h2>
          <TeamAnalyticsTable staff={Object.values(metrics)} />
        </section>

        {/* KPIs */}
        <section className="mt-10">
          <KpiManager />
        </section>

        <p className="mt-6 text-xs text-slate-400">
          New users sign up at <code>/signup</code> using an authorised email. Owner role can only be granted here.
        </p>
      </div>
    </AppShell>
  );
}

function MetricsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">{children}</div>
    </div>
  );
}
function M({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Phone }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="h-3 w-3 text-[#2563eb]" />
      </div>
      <div className="mt-1 text-base font-semibold text-[#0f172a]">{value}</div>
    </div>
  );
}
