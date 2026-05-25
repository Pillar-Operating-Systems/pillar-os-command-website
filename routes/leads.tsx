import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { format, isToday, isPast, parseISO } from "date-fns";
import {
  Search, Trophy, ChevronDown, ChevronUp, CalendarIcon, Lock, CheckCircle2,
  Star, Plus, Upload, ExternalLink, X as XIcon, AlertTriangle, ChevronLeft, ChevronRight,
  Phone, RotateCcw, ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useSales, getLevel, rowToLead, STATUS_LABELS, type Lead, type LeadStatus, type WebScore } from "@/lib/salesStore";
import { usePipeline } from "@/lib/pipelineStore";
import { useAuth } from "@/lib/auth";
import { useAchievements, formatEarned } from "@/lib/achievements";

export const Route = createFileRoute("/leads")({ component: LeadsPage });

type TabKey = "follow_up" | "contacted" | "pipeline" | "archived" | "all";
const PAGE_SIZE = 50;

const TABS: { key: TabKey; label: string; status?: LeadStatus }[] = [
  { key: "follow_up", label: "Follow Up", status: "follow_up" },
  { key: "contacted", label: "Contacted", status: "contacted" },
  { key: "pipeline", label: "In Pipeline", status: "pipeline" },
  { key: "archived", label: "Archived", status: "archived" },
  { key: "all", label: "All Leads" },
];

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-50 text-[#2563eb]",
  follow_up: "bg-amber-50 text-amber-700",
  pipeline: "bg-[#0f172a] text-white",
  archived: "bg-slate-100 text-slate-400",
};

const SCORE_STYLES: Record<WebScore, string> = {
  Good: "bg-blue-50 text-[#2563eb] border-[#2563eb]/30",
  Poor: "bg-amber-50 text-amber-700 border-amber-300",
  None: "bg-slate-100 text-slate-500 border-slate-300",
};

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function Stars({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i <= Math.round(rating) ? "fill-[#2563eb] text-[#2563eb]" : "text-slate-300")} />
      ))}
      <span className="ml-1 text-xs text-slate-600">{rating.toFixed(1)}{reviewCount != null && ` (${reviewCount})`}</span>
    </div>
  );
}

function useDebounced<T>(v: T, ms: number) {
  const [s, setS] = useState(v);
  useEffect(() => { const t = setTimeout(() => setS(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return s;
}

function followUpClasses(dateStr?: string | null) {
  if (!dateStr) return "bg-slate-100 text-slate-500";
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "bg-amber-100 text-amber-800 border border-amber-300";
    if (isPast(d)) return "bg-red-100 text-red-700 border border-red-300";
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  } catch { return "bg-slate-100 text-slate-500"; }
}

function LeadsPage() {
  const { xp, version, archiveLead, setFollowUp, moveToPipelineFromLeads, addLead, importLeads, restoreLead } = useSales();
  const { addDealFromLead } = usePipeline();
  const { displayName, email } = useAuth();
  const navigate = useNavigate();
  const moveLeadToPipeline = useCallback((lead: Lead) => {
    const username = displayName || (email ? email.split("@")[0] : "") || "Unassigned";
    moveToPipelineFromLeads(lead);
    addDealFromLead({ business: lead.business, industry: lead.industry, suburb: lead.suburb, phone: lead.phone }, username);
  }, [displayName, email, moveToPipelineFromLeads, addDealFromLead]);

  const [tab, setTab] = useState<TabKey>("follow_up");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [openerOpen, setOpenerOpen] = useState<Record<string, boolean>>({});
  const [confirmPipeline, setConfirmPipeline] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<TabKey, number>>({ follow_up: 0, contacted: 0, pipeline: 0, archived: 0, all: 0 });
  const [industries, setIndustries] = useState<string[]>([]);

  useEffect(() => { setPage(1); }, [tab, debouncedSearch, industryFilter]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    const t = TABS.find((x) => x.key === tab)!;
    let q = supabase.from("leads").select("*", { count: "exact" });
    if (t.status) q = q.eq("status", t.status);
    else q = q.in("status", ["contacted", "follow_up", "pipeline", "archived"]);
    if (industryFilter !== "all") q = q.ilike("industry", `%${industryFilter}%`);
    if (debouncedSearch.trim()) {
      const s = debouncedSearch.trim().replace(/[%,]/g, "");
      q = q.or(`business_name.ilike.%${s}%,suburb.ilike.%${s}%`);
    }
    // Ordering per tab per spec
    if (tab === "follow_up") q = q.order("follow_up_date", { ascending: true, nullsFirst: false });
    else if (tab === "contacted") q = q.order("updated_at", { ascending: false });
    else if (tab === "pipeline" || tab === "archived") q = q.order("updated_at", { ascending: false });
    else q = q.order("updated_at", { ascending: false });

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await q.range(from, to);
    if (!error) {
      setLeads((data ?? []).map(rowToLead));
      setPageTotal(count ?? 0);
    }
    setLoading(false);
  }, [tab, debouncedSearch, industryFilter, page]);

  useEffect(() => { fetchPage(); }, [fetchPage, version]);

  // Tab counts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [fu, ct, pl, ar, all] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "follow_up"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "contacted"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "pipeline"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "archived"),
        supabase.from("leads").select("id", { count: "exact", head: true }).in("status", ["contacted", "follow_up", "pipeline", "archived"]),
      ]);
      if (cancelled) return;
      setCounts({
        follow_up: fu.count ?? 0,
        contacted: ct.count ?? 0,
        pipeline: pl.count ?? 0,
        archived: ar.count ?? 0,
        all: all.count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [version]);

  // Distinct industries (one-time-ish, refresh on version)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("leads").select("industry").not("industry", "is", null).limit(5000);
      if (cancelled || !data) return;
      const set = new Set<string>();
      data.forEach((r: { industry: string | null }) => { if (r.industry) set.add(r.industry); });
      setIndustries(Array.from(set).sort());
    })();
    return () => { cancelled = true; };
  }, [version]);

  const { current, next } = getLevel(xp);
  const progressPct = next ? Math.min(100, ((xp - current.threshold) / (next.threshold - current.threshold)) * 100) : 100;
  const toNext = next ? next.threshold - xp : 0;
  const achievements = useAchievements();

  const openFollowUp = (id: string, existingDate?: string | null, existingNotes?: string) => {
    setFollowUpFor(followUpFor === id ? null : id);
    setFollowUpDate(existingDate ? parseISO(existingDate) : undefined);
    setFollowUpNotes(existingNotes ?? "");
  };
  const saveFollowUp = (id: string) => {
    if (!followUpDate) return;
    setFollowUp(id, followUpDate.toISOString(), followUpNotes);
    setFollowUpFor(null);
  };

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const [header, ...rows] = lines;
      const cols = header.split(",").map((c) => c.trim().toLowerCase());
      const idx = (k: string) => cols.indexOf(k);
      const parsed = rows.map((r) => {
        const cells = r.split(",").map((c) => c.trim());
        return {
          business: cells[idx("business")] || cells[0] || "Unnamed",
          industry: cells[idx("industry")] || "",
          suburb: cells[idx("suburb")] || "",
          phone: cells[idx("phone")] || "",
          website: cells[idx("website")] || "",
          rating: Number(cells[idx("rating")]) || 0,
          reviewCount: Number(cells[idx("reviewcount")] ?? cells[idx("reviews")]) || 0,
          webScore: (cells[idx("webscore")] as WebScore) || "None",
          whyNeedUs: cells[idx("whyneedus")] || "",
          coldCallOpener: cells[idx("coldcallopener")] || "",
          pillarOSPitch: cells[idx("pillarospitch")] || "",
        };
      });
      importLeads(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const totalPages = Math.max(1, Math.ceil(pageTotal / PAGE_SIZE));
  const fromIdx = pageTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx = Math.min(page * PAGE_SIZE, pageTotal);

  return (
    <AppShell>
      <div className="p-6 lg:p-10 space-y-6 max-w-[1800px]">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Leads Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Follow up, manage and review actioned leads.</p>
        </div>

        {/* XP */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-[#2563eb]/10 flex items-center justify-center">
                <Trophy className="h-4 w-4 text-[#2563eb]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#0f172a]">Level {current.level} — {current.name}</div>
                <div className="text-xs text-slate-500">{xp.toLocaleString()} XP</div>
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {next ? `${toNext.toLocaleString()} XP to Level ${next.level}` : "Max level reached"}
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2563eb] transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.key ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-slate-500 hover:text-[#0f172a]"
              )}
            >
              {t.label}
              <span className={cn(
                "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold",
                tab === t.key ? "bg-[#2563eb] text-white" : "bg-slate-100 text-slate-600"
              )}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Search + industry filter + add (all tab only) */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search business or suburb…"
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#2563eb] text-white text-sm font-medium hover:bg-[#1d4ed8]"
            >
              <Plus className="h-4 w-4" /> Add Lead Manually
            </button>
            {tab === "all" && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-200 bg-white text-sm font-medium text-[#0f172a] hover:bg-slate-50"
                >
                  <Upload className="h-4 w-4" /> Import CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSV} />
              </>
            )}
          </div>

          {industries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setIndustryFilter("all")}
                className={cn(
                  "px-3 py-1 text-xs rounded-full border transition-colors",
                  industryFilter === "all" ? "bg-[#0f172a] text-white border-[#0f172a]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                All industries
              </button>
              {industries.map((i) => (
                <button
                  key={i}
                  onClick={() => setIndustryFilter(i)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border transition-colors",
                    industryFilter === i ? "bg-[#2563eb] text-white border-[#2563eb]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content per tab */}
        {tab === "all" ? (
          <AllLeadsTable
            leads={leads}
            loading={loading}
            followUpFor={followUpFor}
            followUpDate={followUpDate}
            followUpNotes={followUpNotes}
            setFollowUpDate={setFollowUpDate}
            setFollowUpNotes={setFollowUpNotes}
            confirmPipeline={confirmPipeline}
            onArchive={archiveLead}
            onOpenFollow={openFollowUp}
            onSaveFollow={saveFollowUp}
            onCancelFollow={() => setFollowUpFor(null)}
            onPipeline={(id) => setConfirmPipeline(id)}
            onConfirmPipeline={(lead) => { moveLeadToPipeline(lead); setConfirmPipeline(null); }}
            onCancelPipeline={() => setConfirmPipeline(null)}
          />
        ) : tab === "archived" ? (
          <ArchivedList leads={leads} loading={loading} onRestore={restoreLead} />
        ) : tab === "pipeline" ? (
          <PipelineList leads={leads} loading={loading} onView={() => navigate({ to: "/pipeline" })} />
        ) : tab === "contacted" ? (
          <ContactedList
            leads={leads}
            loading={loading}
            openerOpen={openerOpen}
            toggleOpener={(id) => setOpenerOpen((o) => ({ ...o, [id]: !o[id] }))}
            onArchive={archiveLead}
            onFollowUp={(id) => openFollowUp(id)}
            onPipeline={(lead) => { moveLeadToPipeline(lead); }}
            followUpFor={followUpFor}
            followUpDate={followUpDate}
            followUpNotes={followUpNotes}
            setFollowUpDate={setFollowUpDate}
            setFollowUpNotes={setFollowUpNotes}
            onSaveFollow={saveFollowUp}
            onCancelFollow={() => setFollowUpFor(null)}
          />
        ) : (
          <FollowUpList
            leads={leads}
            loading={loading}
            openerOpen={openerOpen}
            toggleOpener={(id) => setOpenerOpen((o) => ({ ...o, [id]: !o[id] }))}
            onArchive={archiveLead}
            onReschedule={(lead) => openFollowUp(lead.id, lead.followUpDate, lead.followUpNotes)}
            onPipeline={(lead) => { moveLeadToPipeline(lead); }}
            followUpFor={followUpFor}
            followUpDate={followUpDate}
            followUpNotes={followUpNotes}
            setFollowUpDate={setFollowUpDate}
            setFollowUpNotes={setFollowUpNotes}
            onSaveFollow={saveFollowUp}
            onCancelFollow={() => setFollowUpFor(null)}
          />
        )}

        {/* Pagination (shown when more than one page) */}
        {pageTotal > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-600">
            <div>
              Showing <span className="font-medium text-[#0f172a]">{fromIdx.toLocaleString()}–{toIdx.toLocaleString()}</span> of <span className="font-medium text-[#0f172a]">{pageTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span className="text-xs tabular-nums text-slate-500">Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Achievements */}
        <div className="bg-white rounded-lg border border-slate-200">
          <button onClick={() => setAchievementsOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <Trophy className="h-4 w-4 text-[#2563eb]" />
              <span className="text-sm font-semibold text-[#0f172a]">Achievements</span>
              <span className="text-xs text-slate-500">{achievements.filter((a) => a.unlocked).length} / {achievements.length} unlocked</span>
            </div>
            {achievementsOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {achievementsOpen && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {achievements.map(({ def, unlocked, date }) => (
                <div key={def.id} className={cn("rounded-lg border p-4 flex items-start gap-3", unlocked ? "border-[#2563eb]/30 bg-[#2563eb]/5" : "border-slate-200 bg-slate-50 opacity-60")}>
                  <div className={cn("h-9 w-9 rounded-md flex items-center justify-center shrink-0", unlocked ? "bg-[#2563eb] text-white" : "bg-slate-200 text-slate-400")}>
                    {unlocked ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className={cn("text-sm font-medium", unlocked ? "text-[#0f172a]" : "text-slate-500")}>{def.name}</div>
                      <span className={cn("text-[10px] uppercase tracking-wider font-semibold", unlocked ? "text-[#2563eb]" : "text-slate-400")}>{def.group}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{def.desc}</div>
                    {unlocked && <div className="mt-1 text-[10px] text-[#2563eb] font-medium">Earned {formatEarned(date)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={addLead} />
    </AppShell>
  );
}

/* ---------------- FOLLOW UP LIST ---------------- */

interface FollowUpListProps {
  leads: Lead[];
  loading: boolean;
  openerOpen: Record<string, boolean>;
  toggleOpener: (id: string) => void;
  onArchive: (id: string) => void;
  onReschedule: (lead: Lead) => void;
  onPipeline: (lead: Lead) => void;
  followUpFor: string | null;
  followUpDate: Date | undefined;
  followUpNotes: string;
  setFollowUpDate: (d: Date | undefined) => void;
  setFollowUpNotes: (s: string) => void;
  onSaveFollow: (id: string) => void;
  onCancelFollow: () => void;
}

function FollowUpList(p: FollowUpListProps) {
  if (!p.loading && p.leads.length === 0) return <EmptyState text="No follow-ups scheduled." />;
  return (
    <div className="grid gap-3">
      {p.leads.map((lead) => (
        <div key={lead.id} className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-[#0f172a]">{lead.business}</h3>
                <span className="text-xs text-slate-500">{lead.industry}</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500">{lead.suburb}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 flex-wrap text-sm">
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-[#2563eb] hover:underline font-medium">
                  <Phone className="h-3.5 w-3.5" /> {lead.phone}
                </a>
                <Stars rating={lead.rating} reviewCount={lead.reviewCount} />
              </div>
            </div>
            <div className={cn("text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap", followUpClasses(lead.followUpDate))}>
              <CalendarIcon className="inline h-3 w-3 mr-1" />
              {lead.followUpDate ? format(parseISO(lead.followUpDate), "d MMM yyyy") : "No date"}
            </div>
          </div>

          {lead.followUpNotes && (
            <div className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-md p-3 border border-slate-100">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Last discussion</div>
              {lead.followUpNotes}
            </div>
          )}

          {lead.coldCallOpener && (
            <div className="mt-3">
              <button onClick={() => p.toggleOpener(lead.id)} className="text-xs text-slate-500 hover:text-[#0f172a] inline-flex items-center gap-1">
                {p.openerOpen[lead.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Cold call opener
              </button>
              {p.openerOpen[lead.id] && (
                <div className="mt-2 text-xs italic text-slate-600 bg-[#2563eb]/5 border border-[#2563eb]/20 rounded-md p-3">
                  "{lead.coldCallOpener}"
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => p.onArchive(lead.id)} className="px-3 py-1.5 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">Not interested</button>
            <button onClick={() => p.onReschedule(lead)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-[#2563eb] text-[#2563eb] hover:bg-[#2563eb]/5">
              <CalendarIcon className="h-3 w-3" /> Reschedule follow up
            </button>
            <button onClick={() => p.onPipeline(lead)} className="px-3 py-1.5 text-xs rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
              Move to Pipeline
            </button>
          </div>

          {p.followUpFor === lead.id && (
            <FollowUpEditor
              date={p.followUpDate}
              notes={p.followUpNotes}
              setDate={p.setFollowUpDate}
              setNotes={p.setFollowUpNotes}
              onSave={() => p.onSaveFollow(lead.id)}
              onCancel={p.onCancelFollow}
              business={lead.business}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- CONTACTED LIST ---------------- */

function ContactedList(p: Omit<FollowUpListProps, "onReschedule"> & { onFollowUp: (id: string) => void }) {
  if (!p.loading && p.leads.length === 0) return <EmptyState text="No contacted leads." />;
  return (
    <div className="grid gap-3">
      {p.leads.map((lead) => (
        <div key={lead.id} className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-[#0f172a]">{lead.business}</h3>
                <span className="text-xs text-slate-500">{lead.industry}</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500">{lead.suburb}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 flex-wrap text-sm">
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-[#2563eb] hover:underline font-medium">
                  <Phone className="h-3.5 w-3.5" /> {lead.phone}
                </a>
                <Stars rating={lead.rating} reviewCount={lead.reviewCount} />
              </div>
            </div>
            <div className="text-xs text-slate-500 whitespace-nowrap">
              Last contacted {lead.lastContacted ? format(parseISO(lead.lastContacted), "d MMM yyyy") : "—"}
            </div>
          </div>

          {lead.coldCallOpener && (
            <div className="mt-3">
              <button onClick={() => p.toggleOpener(lead.id)} className="text-xs text-slate-500 hover:text-[#0f172a] inline-flex items-center gap-1">
                {p.openerOpen[lead.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Cold call opener
              </button>
              {p.openerOpen[lead.id] && (
                <div className="mt-2 text-xs italic text-slate-600 bg-[#2563eb]/5 border border-[#2563eb]/20 rounded-md p-3">"{lead.coldCallOpener}"</div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => p.onArchive(lead.id)} className="px-3 py-1.5 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">Not interested</button>
            <button onClick={() => p.onFollowUp(lead.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-[#2563eb] text-[#2563eb] hover:bg-[#2563eb]/5">
              <CalendarIcon className="h-3 w-3" /> Schedule follow up
            </button>
            <button onClick={() => p.onPipeline(lead)} className="px-3 py-1.5 text-xs rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
              Move to Pipeline
            </button>
          </div>

          {p.followUpFor === lead.id && (
            <FollowUpEditor
              date={p.followUpDate}
              notes={p.followUpNotes}
              setDate={p.setFollowUpDate}
              setNotes={p.setFollowUpNotes}
              onSave={() => p.onSaveFollow(lead.id)}
              onCancel={p.onCancelFollow}
              business={lead.business}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- PIPELINE LIST ---------------- */

function PipelineList({ leads, loading, onView }: { leads: Lead[]; loading: boolean; onView: (lead: Lead) => void }) {
  if (!loading && leads.length === 0) return <EmptyState text="No leads in pipeline yet." />;
  return (
    <div className="grid gap-2">
      {leads.map((lead) => (
        <div key={lead.id} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-[#0f172a]">{lead.business}</h3>
              <span className="text-xs text-slate-500">{lead.industry}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Moved to pipeline {lead.lastContacted ? format(parseISO(lead.lastContacted), "d MMM yyyy") : "recently"}
            </div>
          </div>
          <button onClick={() => onView(lead)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-[#0f172a] text-white hover:bg-[#1e293b]">
            View in Pipeline <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- ARCHIVED LIST ---------------- */

function ArchivedList({ leads, loading, onRestore }: { leads: Lead[]; loading: boolean; onRestore: (id: string) => void }) {
  if (!loading && leads.length === 0) return <EmptyState text="No archived leads." />;
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Business</th>
            <th className="text-left px-4 py-3 font-medium">Industry</th>
            <th className="text-left px-4 py-3 font-medium">Suburb</th>
            <th className="text-left px-4 py-3 font-medium">Phone</th>
            <th className="text-left px-4 py-3 font-medium">Date archived</th>
            <th className="text-right px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-medium text-[#0f172a]">{lead.business}</td>
              <td className="px-4 py-3 text-slate-500">{lead.industry}</td>
              <td className="px-4 py-3 text-slate-500">{lead.suburb}</td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{lead.phone}</td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {lead.lastContacted ? format(parseISO(lead.lastContacted), "d MMM yyyy") : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onRestore(lead.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-[#2563eb] text-[#2563eb] hover:bg-[#2563eb]/5">
                  <RotateCcw className="h-3 w-3" /> Restore
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- ALL LEADS TABLE ---------------- */

interface AllTableProps {
  leads: Lead[];
  loading: boolean;
  followUpFor: string | null;
  followUpDate: Date | undefined;
  followUpNotes: string;
  setFollowUpDate: (d: Date | undefined) => void;
  setFollowUpNotes: (s: string) => void;
  confirmPipeline: string | null;
  onArchive: (id: string) => void;
  onOpenFollow: (id: string) => void;
  onSaveFollow: (id: string) => void;
  onCancelFollow: () => void;
  onPipeline: (id: string) => void;
  onConfirmPipeline: (lead: Lead) => void;
  onCancelPipeline: () => void;
}

function AllLeadsTable(p: AllTableProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {["Business", "Industry", "Suburb", "Phone", "Website", "Rating", "Reviews", "Web Score", "Why they need us", "Cold call opener", "Status"].map((h) => (
                <th key={h} className="text-left px-3 py-3 font-medium whitespace-nowrap">{h}</th>
              ))}
              <th className="text-right px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.leads.map((lead) => {
              const archived = lead.status === "archived";
              const inPipeline = lead.status === "pipeline";
              const dimmed = archived || inPipeline;
              const cell = cn("px-3 py-3 align-top", dimmed && "text-slate-400");
              return (
                <>
                  <tr key={lead.id} className={cn("hover:bg-slate-50/60", dimmed && "bg-slate-50/40")}>
                    <td className={cn(cell, "font-medium text-[#0f172a] min-w-[160px]", archived && "line-through text-slate-400")}>{lead.business}</td>
                    <td className={cell}>{lead.industry}</td>
                    <td className={cell}>{lead.suburb}</td>
                    <td className={cn(cell, "whitespace-nowrap")}>{lead.phone}</td>
                    <td className={cell}>
                      {lead.website ? (
                        <a href={`https://${lead.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#2563eb] hover:underline">
                          {lead.website} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : "—"}
                    </td>
                    <td className={cell}><Stars rating={lead.rating} /></td>
                    <td className={cell}>{lead.reviewCount}</td>
                    <td className={cell}>
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", SCORE_STYLES[lead.webScore])}>{lead.webScore}</span>
                    </td>
                    <td className={cn(cell, "max-w-[240px] text-xs text-slate-600")}>{lead.whyNeedUs}</td>
                    <td className={cn(cell, "max-w-[280px] text-xs text-slate-600 italic")}>"{lead.coldCallOpener}"</td>
                    <td className={cell}>
                      <StatusBadge status={lead.status} />
                      {lead.status === "follow_up" && lead.followUpDate && (
                        <div className="text-xs text-slate-400 mt-1">{format(parseISO(lead.followUpDate), "d MMM")}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button disabled={dimmed} onClick={() => p.onArchive(lead.id)} className="px-2.5 py-1.5 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">
                          Not interested
                        </button>
                        <button disabled={dimmed} onClick={() => p.onOpenFollow(lead.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-[#2563eb] text-[#2563eb] hover:bg-[#2563eb]/5 disabled:opacity-40">
                          <CalendarIcon className="h-3 w-3" /> Follow up later
                        </button>
                        <div className="relative">
                          <button disabled={dimmed} onClick={() => p.onPipeline(lead.id)} className="px-2.5 py-1.5 text-xs rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-40">
                            Move to Pipeline
                          </button>
                          {p.confirmPipeline === lead.id && (
                            <div className="absolute right-0 top-full mt-2 z-20 w-64 bg-white border border-slate-200 rounded-md shadow-lg p-3">
                              <div className="flex items-start gap-2 mb-3">
                                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-slate-600">Send this lead to the Pipeline? This can't be undone.</div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <button onClick={p.onCancelPipeline} className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</button>
                                <button onClick={() => p.onConfirmPipeline(lead)} className="px-2.5 py-1 text-xs rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">Confirm</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {p.followUpFor === lead.id && (
                    <tr key={`${lead.id}-fu`} className="bg-[#2563eb]/5">
                      <td colSpan={12} className="px-4 py-4">
                        <FollowUpEditor
                          date={p.followUpDate}
                          notes={p.followUpNotes}
                          setDate={p.setFollowUpDate}
                          setNotes={p.setFollowUpNotes}
                          onSave={() => p.onSaveFollow(lead.id)}
                          onCancel={p.onCancelFollow}
                          business={lead.business}
                          inline
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {p.leads.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-sm text-slate-400">
                  {p.loading ? "Loading…" : "No leads match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- SHARED ---------------- */

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-sm text-slate-400">{text}</div>
  );
}

function FollowUpEditor({
  date, notes, setDate, setNotes, onSave, onCancel, business, inline,
}: {
  date: Date | undefined; notes: string;
  setDate: (d: Date | undefined) => void; setNotes: (s: string) => void;
  onSave: () => void; onCancel: () => void; business: string; inline?: boolean;
}) {
  return (
    <div className={cn(!inline && "mt-4 border-t border-slate-100 pt-4")}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="text-sm font-medium text-[#0f172a]">Schedule follow-up for {business}</div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><XIcon className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Follow-up date</label>
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm">
                {date ? format(date, "d MMM yyyy") : "Pick a date"}
                <CalendarIcon className="h-4 w-4 text-slate-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (!d) { setDate(undefined); return; }
                  const merged = new Date(d);
                  if (date) merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
                  else merged.setHours(9, 0, 0, 0);
                  setDate(merged);
                }}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <label className="text-xs font-medium text-slate-600 mt-3 mb-1 block">Follow-up time</label>
          <input
            type="time"
            value={date ? format(date, "HH:mm") : "09:00"}
            onChange={(e) => {
              const [hh, mm] = e.target.value.split(":").map(Number);
              const base = date ? new Date(date) : new Date();
              base.setHours(hh || 0, mm || 0, 0, 0);
              setDate(base);
            }}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">What was discussed / why following up</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent" placeholder="e.g. Spoke with owner, wants to revisit after busy season." />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</button>
        <button onClick={onSave} disabled={!date} className="px-3 py-1.5 text-xs rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-40">Save follow-up</button>
      </div>
    </div>
  );
}

function AddLeadDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (l: Omit<Lead, "id" | "lastContacted" | "status">) => void }) {
  const [form, setForm] = useState({ business: "", industry: "", suburb: "", phone: "", website: "", notes: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.business.trim()) return;
    onAdd({
      ...form, rating: 0, reviewCount: 0, webScore: "None",
      whyNeedUs: form.notes, coldCallOpener: "", pillarOSPitch: "",
    });
    setForm({ business: "", industry: "", suburb: "", phone: "", website: "", notes: "" });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add lead manually</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {[
            { k: "business", label: "Business name" },
            { k: "industry", label: "Industry" },
            { k: "suburb", label: "Suburb" },
            { k: "phone", label: "Phone" },
            { k: "website", label: "Website" },
          ].map((f) => (
            <div key={f.k}>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{f.label}</label>
              <input value={form[f.k as keyof typeof form]} onChange={set(f.k as keyof typeof form)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent" />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} rows={3} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</button>
          <button onClick={submit} className="px-3 py-2 text-sm rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">Add lead</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
