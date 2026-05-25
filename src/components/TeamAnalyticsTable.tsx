import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { StaffMetrics } from "@/lib/staff.functions";

type SortKey =
  | "username" | "callsToday" | "callsWeek" | "callsTotal"
  | "followUpsToday" | "leadsToPipeline" | "callToPipelinePct"
  | "pipelineValue" | "pipelineMrr" | "totalRevenue" | "xp" | "rank";

const COLS: { key: SortKey; label: string; numeric?: boolean; fmt?: (v: number) => string }[] = [
  { key: "username", label: "Staff" },
  { key: "callsToday", label: "Calls Today", numeric: true },
  { key: "callsWeek", label: "Calls Week", numeric: true },
  { key: "callsTotal", label: "Calls Total", numeric: true },
  { key: "followUpsToday", label: "FU Today", numeric: true },
  { key: "leadsToPipeline", label: "→ Pipeline", numeric: true },
  { key: "callToPipelinePct", label: "Conv %", numeric: true, fmt: (v) => `${v}%` },
  { key: "pipelineValue", label: "Pipeline $", numeric: true, fmt: (v) => `$${v.toLocaleString()}` },
  { key: "pipelineMrr", label: "MRR $", numeric: true, fmt: (v) => `$${v.toLocaleString()}` },
  { key: "totalRevenue", label: "Total Rev", numeric: true, fmt: (v) => `$${v.toLocaleString()}` },
  { key: "xp", label: "XP", numeric: true },
  { key: "rank", label: "Rank", numeric: true, fmt: (v) => `#${v}` },
];

export function TeamAnalyticsTable({ staff }: { staff: StaffMetrics[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("xp");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...staff];
    arr.sort((a, b) => {
      const av = (a as unknown as Record<SortKey, unknown>)[sortKey];
      const bv = (b as unknown as Record<SortKey, unknown>)[sortKey];
      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      const as = String(av ?? ""); const bs = String(bv ?? "");
      return dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return arr;
  }, [staff, sortKey, dir]);

  const toggle = (k: SortKey) => {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setDir(k === "username" ? "asc" : "desc"); }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-sm min-w-[1100px]">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            {COLS.map((c) => (
              <th key={c.key} className={`px-3 py-3 ${c.numeric ? "text-right" : ""}`}>
                <button onClick={() => toggle(c.key)}
                  className={`inline-flex items-center gap-1 hover:text-[#0f172a] ${sortKey === c.key ? "text-[#0f172a]" : ""}`}>
                  {c.label}
                  {sortKey === c.key && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.length === 0 && <tr><td colSpan={COLS.length} className="px-4 py-6 text-slate-500">No data.</td></tr>}
          {sorted.map((s) => (
            <tr key={s.userId} className="hover:bg-slate-50">
              {COLS.map((c) => {
                const v = (s as unknown as Record<SortKey, unknown>)[c.key];
                const display = c.fmt && typeof v === "number" ? c.fmt(v) :
                  c.key === "username" ? (s.username ?? s.email) :
                  String(v ?? "");
                return (
                  <td key={c.key} className={`px-3 py-2.5 ${c.numeric ? "text-right tabular-nums text-slate-700" : "font-medium text-[#0f172a]"}`}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
