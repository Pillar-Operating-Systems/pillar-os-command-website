import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { DollarSign, Users, Bot, AlertTriangle, Activity, Trophy } from "lucide-react";
import { useClients } from "@/lib/clientsStore";
import { usePipeline, dealOneTimeTotal } from "@/lib/pipelineStore";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAllStaffMetrics, type StaffMetrics } from "@/lib/staff.functions";
import { SalesHome } from "@/components/SalesHome";
import { NoticeBoard } from "@/components/NoticeBoard";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!role) return <Navigate to="/login" />;
  if (role === "sales") return <AppShell><SalesHome /></AppShell>;
  return <OwnerHome />;
}

function OwnerHome() {
  const { clients } = useClients();
  const { deals } = usePipeline();
  const fetchStaff = useServerFn(getAllStaffMetrics);
  const [staff, setStaff] = useState<StaffMetrics[]>([]);

  useEffect(() => {
    fetchStaff().then((r) => setStaff(r.staff)).catch(() => setStaff([]));
  }, [fetchStaff]);

  const totalMrr = useMemo(
    () => clients.filter((c) => c.status === "Active").reduce((s, c) => s + (c.mrr || 0), 0),
    [clients],
  );
  const activeClients = clients.filter((c) => c.status === "Active").length;

  const oneTimeThisMonth = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return deals
      .filter((d) => (d.stages.invoice_paid ?? "").startsWith(ym))
      .reduce((s, d) => s + dealOneTimeTotal(d), 0);
  }, [deals]);

  const pipelineValue = useMemo(
    () => deals.reduce((s, d) => s + dealOneTimeTotal(d) + (d.mrr || 0) * 12, 0),
    [deals],
  );

  return (
    <AppShell requireRole="owner">
      <div className="p-6 lg:p-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Command Centre</h1>
          <p className="mt-1 text-sm text-slate-500">Live overview of PillarOS operations.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-slate-500">Total MRR</span>
              <DollarSign className="h-4 w-4 text-[#2563eb]" />
            </div>
            <div className="mt-3 text-3xl font-semibold text-[#0f172a]">${totalMrr.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">
              One-time fees this month:{" "}
              <span className="font-medium text-[#0f172a]">${oneTimeThisMonth.toLocaleString()}</span>
            </div>
          </div>
          <SimpleStat label="Active Clients" value={activeClients.toString()} icon={Users} />
          <SimpleStat label="Employees Running" value="14" icon={Bot} />
          <SimpleStat label="Open Alerts" value="3" icon={AlertTriangle} />
        </div>

        {/* Team Activity Today */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-[#2563eb]" />
            <h2 className="text-sm font-semibold text-[#0f172a]">Team Activity Today</h2>
          </div>
          {staff.length === 0 ? (
            <p className="text-sm text-slate-500">No staff data yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {staff.map((s) => {
                const initial = (s.username || s.email).charAt(0).toUpperCase();
                const dotClass =
                  s.activityState === "active30" ? "bg-emerald-500"
                  : s.activityState === "activeToday" ? "bg-amber-400"
                  : "bg-slate-300";
                return (
                  <div key={s.userId} className="flex items-start gap-3 p-3 rounded-md border border-slate-200">
                    <div className="relative h-9 w-9 rounded-full bg-[#0f172a] text-white flex items-center justify-center text-sm font-semibold shrink-0">
                      {initial}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${dotClass}`} />
                    </div>
                    <div className="min-w-0 text-xs flex-1">
                      <div className="font-semibold text-[#0f172a] truncate">{s.username ?? s.email}</div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-500">
                        <div>Calls: <span className="text-[#0f172a] font-medium">{s.callsTodayCount}</span></div>
                        <div>Pipeline: <span className="text-[#0f172a] font-medium">{s.pipelineTodayCount}</span></div>
                        <div>Follow ups: <span className="text-[#0f172a] font-medium">{s.followUpsToday}</span></div>
                        <div>Archived: <span className="text-[#0f172a] font-medium">{s.archivedToday}</span></div>
                        <div className="col-span-2">Value: <span className="text-[#0f172a] font-medium">${s.pipelineValueToday.toLocaleString()}</span></div>
                      </div>
                      {s.lastActionLabel && (
                        <div className="mt-1.5 text-[11px] text-slate-400 truncate" title={s.lastActionLabel}>
                          {s.lastActionLabel}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <NoticeBoard />

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[#0f172a] mb-4">Pipeline Overview</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Total Contract Value</div>
              <div className="mt-1 text-2xl font-semibold text-[#0f172a]">${pipelineValue.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Active Deals</div>
              <div className="mt-1 text-2xl font-semibold text-[#0f172a]">{deals.length}</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SimpleStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof DollarSign }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-[#2563eb]" />
      </div>
      <div className="mt-3 text-3xl font-semibold text-[#0f172a]">{value}</div>
    </div>
  );
}
