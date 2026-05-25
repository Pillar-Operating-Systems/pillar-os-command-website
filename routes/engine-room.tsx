import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/engine-room")({
  component: EngineRoomPage,
});

type DigitalEmployee = {
  id: string;
  name: string;
  emoji: string | null;
  status: string | null;
  active_client_count: number | null;
  last_activity: string | null;
  error_count: number | null;
};

const SUB_NAV = [
  "Digital Employees",
  "Automations",
  "Clients",
  "Deployment",
  "AI Agents",
  "Infrastructure",
  "Credentials",
  "Intelligence",
  "Financials",
  "Operations",
  "Resources",
] as const;

const COMING_SOON = [
  { emoji: "🔍", name: "SEO Manager", desc: "Automated SEO optimisation and ranking improvements" },
  { emoji: "🛠️", name: "Operations Coordinator", desc: "Internal business operations and job management" },
  { emoji: "🧠", name: "AI Chief of Staff", desc: "Monitors all active digital employees and coordinates handoffs" },
  { emoji: "📈", name: "AI Business Advisor", desc: "Strategic AI business partner and growth advisor" },
];

function EngineRoomPage() {
  const { role, loading } = useAuth();
  const [active, setActive] = useState<string>("Digital Employees");
  const [employees, setEmployees] = useState<DigitalEmployee[]>([]);
  const [hasErrors, setHasErrors] = useState(false);

  useEffect(() => {
    if (role !== "owner") return;
    (async () => {
      const [{ data: de }, { count }] = await Promise.all([
        supabase.from("digital_employees").select("id,name,emoji,status,active_client_count,last_activity,error_count"),
        supabase.from("error_logs").select("id", { count: "exact", head: true }),
      ]);
      setEmployees((de as DigitalEmployee[]) ?? []);
      setHasErrors((count ?? 0) > 0);
    })();
  }, [role]);

  if (loading) return null;
  if (!role) return <Navigate to="/login" />;
  if (role !== "owner") return <Navigate to="/leads" />;

  return (
    <div className="min-h-screen flex" style={{ background: "#0F172A", color: "#F1F5F9" }}>
      <Sidebar />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 flex">
        {/* Sub-nav */}
        <nav
          className="w-56 shrink-0 p-3 space-y-1 border-r"
          style={{ background: "#1E293B", borderColor: "#475569" }}
        >
          <div className="px-3 py-2 text-xs uppercase tracking-wider" style={{ color: "#94A3B8" }}>
            Engine Room
          </div>
          {SUB_NAV.map((item) => {
            const isActive = active === item;
            return (
              <button
                key={item}
                onClick={() => setActive(item)}
                className="w-full text-left relative px-4 py-2 rounded-md text-sm transition-colors"
                style={{
                  background: isActive ? "rgba(59,130,246,0.1)" : "transparent",
                  color: isActive ? "#F1F5F9" : "#94A3B8",
                  borderLeft: `3px solid ${isActive ? "#3B82F6" : "transparent"}`,
                }}
              >
                {item}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 p-6 lg:p-10 overflow-auto">
          {active === "Digital Employees" ? (
            <DigitalEmployeesSection employees={employees} hasErrors={hasErrors} />
          ) : (
            <ComingSoonPanel title={active} />
          )}
        </div>
      </main>

      <style>{`
        @keyframes erPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }
        .er-pulse { animation: erPulse 1.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function ComingSoonPanel({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold" style={{ color: "#F1F5F9" }}>{title}</h1>
      <div
        className="mt-6 rounded-xl p-12 text-center"
        style={{ background: "#1E293B", border: "1px solid #475569", color: "#94A3B8" }}
      >
        Coming soon
      </div>
    </div>
  );
}

function statusBadge(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "live" || s === "active") return { label: "Live", bg: "#10B981" };
  if (s === "building") return { label: "Building", bg: "#F59E0B" };
  return { label: "Coming Soon", bg: "#475569" };
}

function fmtDate(d: string | null) {
  if (!d) return "No activity yet";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function DigitalEmployeesSection({ employees, hasErrors }: { employees: DigitalEmployee[]; hasErrors: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold" style={{ color: "#F1F5F9" }}>Digital Employees</h1>
        {hasErrors && (
          <span
            className="er-pulse inline-block h-3 w-3 rounded-full"
            style={{ background: "#EF4444" }}
            aria-label="Errors detected"
          />
        )}
      </div>
      <p className="mt-1 text-sm" style={{ color: "#94A3B8" }}>Manage your AI workforce</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {employees.map((e) => {
          const s = statusBadge(e.status);
          return (
            <div
              key={e.id}
              className="rounded-xl p-5"
              style={{ background: "#334155", border: "1px solid #475569" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl">{e.emoji ?? "🤖"}</span>
                  <span className="font-semibold truncate" style={{ color: "#F1F5F9" }}>{e.name}</span>
                </div>
                <span
                  className="text-xs px-2 py-1 rounded-md font-medium"
                  style={{ background: s.bg, color: "#0F172A" }}
                >
                  {s.label}
                </span>
              </div>

              <div className="mt-4 space-y-1.5 text-sm" style={{ color: "#94A3B8" }}>
                <div>Active clients: <span style={{ color: "#F1F5F9" }}>{e.active_client_count ?? 0}</span></div>
                <div>Last activity: <span style={{ color: "#F1F5F9" }}>{fmtDate(e.last_activity)}</span></div>
              </div>

              {(e.error_count ?? 0) > 0 && (
                <div
                  className="mt-3 inline-block text-xs px-2 py-1 rounded-md font-medium"
                  style={{ background: "#EF4444", color: "#F1F5F9" }}
                >
                  {e.error_count} error{(e.error_count ?? 0) === 1 ? "" : "s"}
                </div>
              )}

              <button
                className="mt-4 w-full py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: "#3B82F6", color: "#F1F5F9" }}
              >
                Manage
              </button>
            </div>
          );
        })}

        {COMING_SOON.map((c) => (
          <div
            key={c.name}
            className="rounded-xl p-5"
            style={{ background: "#334155", border: "1px solid #475569", opacity: 0.6 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl">{c.emoji}</span>
                <span className="font-semibold truncate" style={{ color: "#F1F5F9" }}>{c.name}</span>
              </div>
              <span
                className="text-xs px-2 py-1 rounded-md font-medium"
                style={{ background: "#475569", color: "#F1F5F9" }}
              >
                Coming Soon
              </span>
            </div>
            <p className="mt-3 text-sm" style={{ color: "#94A3B8" }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
